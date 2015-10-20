'use strict';

const {Cc, Ci, Cr} = require('chrome');

const {Class, mix} = require('sdk/core/heritage');
const {emit} = require('sdk/event/core');
const {EventTarget} = require('sdk/event/target');
const events = require('sdk/system/events');
const unload = require('sdk/system/unload');

const {getBrowserForRequest, getWindowForRequest} = require('./utils');

const ioService = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);


const STATE_STOPPED = 0;
const STATE_STARTED = 1;

let tracerState = STATE_STOPPED;

let browserMap = new WeakMap();


/**
 * This function registers a new logger for given browser.
 * It returns logger instance.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 * @param {Object} options
 *    Logger instance options
 */
const registerBrowser = function(browser, options) {
    if (tracerState !== STATE_STARTED) {
        // We assume that when you register a browser, you want start tracing.
        startTracer();
    }

    // Unregister any previously registered browser
    unregisterBrowser(browser);

    // Create and register listener
    let listener = NetLogger(browser, options);
    browserMap.set(browser, listener);

    return listener;
};
exports.registerBrowser = registerBrowser;


/*
 * This function unregisters an existing logger for given browser.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 */
const unregisterBrowser = function(browser) {
    if (browser && browserMap.has(browser)) {
        browserMap.delete(browser);
    }
};
exports.unregisterBrowser = unregisterBrowser;


/*
 * This function returns the logger instance associated with given browser.
 * It returns null if no logger exists.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 */
const getListener = function(browser) {
    if (browser && browserMap.has(browser)) {
        return browserMap.get(browser);
    }
    return null;
};
exports.getListener = getListener;


/*
 * This function starts tracers. You should no need it as registerBrowser
 * calls it if tracer is off.
 */
const startTracer = function() {
    events.on('http-on-modify-request', onRequestStart);
    events.on('http-on-examine-response', onRequestResponse);
    events.on('http-on-examine-cached-response', onRequestResponse);

    unload.when(stopTracer);
    tracerState = STATE_STARTED;
};
exports.startTracer = startTracer;


/*
 * This function stops all tracers.
 */
const stopTracer = function() {
    try {
        events.off('http-on-modify-request', onRequestStart);
        events.off('http-on-examine-response', onRequestResponse);
        events.off('http-on-examine-cached-response', onRequestResponse);
    }
    catch(e) {
        console.exception(e);
    }

    browserMap = new WeakMap();
    tracerState = STATE_STOPPED;
};
exports.stopTracer = stopTracer;


const NetLogger = Class({
    extends: EventTarget,

    initialize: function(browser, options) {
        EventTarget.prototype.initialize.call(this, options);

        this.browser = browser;
        this.requestStack = [];
        this.lastIndex = -1;
    },

    flush: function() {
        this.requestStack = [];
        this.lastIndex = -1;
    }
});


const onRequestStart = function(evt) {
    let {subject} = evt;
    try {
        subject.QueryInterface(Ci.nsIChannel);
    }
    catch(e) {
        return;
    }

    let browser = getBrowserForRequest(subject),
        listener = browser && getListener(browser) || null;

    if (!browser || !listener) {
        return;
    }

    // We increment lastIndex and push request URL to requestStack. Thus we can remove
    // elements from stack and keep a consistent index value.
    listener.lastIndex++;
    let index = listener.lastIndex;
    listener.requestStack.push(subject.name);

    emit(listener, 'modifyrequest', subject);
    emit(listener, 'request', Object.freeze(traceRequest(index, subject)));
};


const onRequestResponse = function(evt) {
    let {subject} = evt;
    try {
        subject.QueryInterface(Ci.nsIChannel);
    }
    catch(e) {
        return;
    }

    let browser = getBrowserForRequest(subject),
        listener = browser && getListener(browser) || null;

    if (!browser || !listener) {
        return;
    }

    // Get request ID
    // Index is obtained by getting the first occurence of request URL in stack. Then
    // we remove this entry from stack and compute index value based on found position and
    // stack length.
    let i = listener.requestStack.indexOf(subject.name);
    listener.requestStack.splice(i, 1);
    let index = listener.lastIndex - listener.requestStack.length;

    emit(listener, 'examineresponse', subject);

    listener = new TracingListener(subject, index, listener);
    subject.QueryInterface(Ci.nsITraceableChannel);
    listener.originalListener = subject.setNewListener(listener);
};


const TracingListener = function(subject, index, listener) {
    this.target = listener;
    this.dataLength = 0;
    this.response = Object.freeze(traceResponse(index, subject));
};
TracingListener.prototype = {
    QueryInterface: function (aIID) {
        if (aIID.equals(Ci.nsIStreamListener) ||
            aIID.equals(Ci.nsISupports)) {
            return this;
        }
        throw Cr.NS_NOINTERFACE;
    },

    onStartRequest: function(request, context) {
        this.originalListener.onStartRequest(request, context);
        try {
            request.QueryInterface(Ci.nsIChannel);
            if (getListener(getBrowserForRequest(request)) === null) {
                return;
            }
        }
        catch(e) {
            return;
        }

        if (typeof(request.URI) === 'undefined' || !this._inWindow(request)) {
            return;
        }

        emit(this.target, 'startresponse', request, context);
        emit(this.target, 'response', mix(this.response, {
            'stage': 'start',
            'time': new Date()
        }));
    },

    onDataAvailable: function(request, context, inputStream, offset, count) {
        try {
            try {
                request.QueryInterface(Ci.nsIChannel);
                if (getListener(getBrowserForRequest(request)) === null) {
                    return;
                }
            }
            catch(e) {
                return;
            }

            if (typeof(request.URI) !== 'undefined' && this._inWindow(request)) {
                this.dataLength += count;

                let [data, newIS] = this._captureData(inputStream, count);
                inputStream = newIS;

                emit(this.target, 'dataavailable', request, context, data, offset, count);
                emit(this.target, 'response', mix(this.response, {
                    stage: 'data',
                    time: new Date(),
                    data: data
                }));
            }
        }
        catch(e) {
            console.exception(e);
        }
        finally {
            try {
                // loading may be aborted. let's catch the error to not polluate the console...
                this.originalListener.onDataAvailable(request, context, inputStream, offset, count);
            } catch(e) {
            }
        }
    },

    onStopRequest: function(request, context, statusCode) {
        this.originalListener.onStopRequest(request, context, statusCode);

        try {
            request.QueryInterface(Ci.nsIChannel);
            if (getListener(getBrowserForRequest(request)) === null) {
                return;
            }
        }
        catch(e) {
            return;
        }

        try {
            if (typeof(request.URI) === 'undefined' || !this._inWindow(request)) {
                return;
            }

            // browser could have been removed during request
            let browser = getBrowserForRequest(request);
            if (browser === null || getListener(browser) === null) {
                return;
            }

            // Finish response
            emit(this.target, 'stopresponse', request, context, statusCode);
            emit(this.target, 'response', mix(this.response, {
                stage: 'end',
                time: new Date(),
                bodySize: this.response.redirectURL ? 0 : this.dataLength
            }));

            // Cleanup our mess
            this.response = {};
        }
        catch(e) {
            console.exception(e);
        }
    },

    _inWindow: function(request) {
        let win = getWindowForRequest(request);
        return win !== null && typeof(win) !== 'undefined' && typeof(win.document) !== 'undefined';
    },

    _captureData: function(inputStream, count) {
        let binaryInputStream = Cc['@mozilla.org/binaryinputstream;1']
                .createInstance(Ci.nsIBinaryInputStream);
        let storageStream = Cc['@mozilla.org/storagestream;1']
                .createInstance(Ci.nsIStorageStream);
        let binaryOutputStream = Cc['@mozilla.org/binaryoutputstream;1']
                .createInstance(Ci.nsIBinaryOutputStream);

        binaryInputStream.setInputStream(inputStream);
        storageStream.init(8192, count, null);
        binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

        let data = binaryInputStream.readBytes(count);
        binaryOutputStream.writeBytes(data, count);

        return [data, storageStream.newInputStream(0)];
    }
};



const traceRequest = function(id, request) {
    request.QueryInterface(Ci.nsIHttpChannel);
    let headers = [];
    request.visitRequestHeaders(function(name, value) {
        value.split('\n').forEach(function(v) {
            headers.push({'name': name, 'value': v});
        });
    });

    return {
        id: id,
        method: request.requestMethod,
        url: request.URI.spec,
        time: new Date(),
        headers: headers
    };
};


const traceResponse = function(id, request) {
    request.QueryInterface(Ci.nsIHttpChannel);
    let headers = [];
    request.visitResponseHeaders(function(name, value) {
        value.split('\n').forEach(function(v) {
            headers.push({'name': name, 'value': v});
        });
    });

    // Getting redirect if any
    let redirect = null
    if (parseInt(request.responseStatus / 100) === 3) {
        headers.forEach(function(value) {
            if (value.name.toLowerCase() == 'location') {
                redirect = ioService.newURI(value.value, null, request.URI).spec;
            }
        });
    }

    return {
        id: id,
        url: request.URI.spec,
        time: null,
        headers: headers,
        bodySize: 0,
        contentType: request.contentType,
        contentCharset: request.contentCharset,
        redirectURL: redirect,
        stage: null,
        status: request.responseStatus,
        statusText: request.responseStatusText,

        // Extensions
        referrer: request.referrer != null && request.referrer.spec || ''
    };
};
