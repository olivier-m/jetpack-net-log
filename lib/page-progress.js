'use strict';

const {Cc, Ci, Cr, components} = require('chrome');

const {Class, mix} = require('sdk/core/heritage');
const {emit} = require('sdk/event/core');
const {EventTarget} = require('sdk/event/target');
const events = require('sdk/system/events');
const unload = require('sdk/system/unload');

const {getBrowserForRequest, getWindowForRequest, getImageInfo} = require('./utils');

const WPL = Ci.nsIWebProgressListener;


let browserMap = new WeakMap();
let listenerList = [];


/**
 * This functions registers a new progress listener for given browser.
 * It returns listener instance.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 * @param {Object} options
 *    Logger instance options
 */
const registerBrowser = function(browser, options) {
    // Unregister any previously registered browser
    unregisterBrowser(browser);

    let listener = PageProgress(browser, options);
    browserMap.set(browser, listener);
    listenerList.push(listener);

    return listener;
};
exports.registerBrowser = registerBrowser;


/*
 * This function unregisters an existing progress listener for given browser.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 */
const unregisterBrowser = function(browser) {
    let listener = getListener(browser);
    if (listener !== null) {
        listener.stop();
        listenerList = listenerList.filter(function(v) v !== listener);
        browserMap.delete(browser);
    }
};
exports.unregisterBrowser = unregisterBrowser;


/*
 * This function returns the listener instance associated with given browser.
 * It returns null if no listener exists.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 */
const getListener = function(browser) {
    if (browserMap.has(browser)) {
        return browserMap.get(browser);
    }
    return null;
};
exports.getListener = getListener;


unload.when(function() {
    browserMap = new WeakMap();
    listenerList = listenerList.filter(function(v) {
        v.stop();
        return false;
    });
});


const PageProgress = Class({
    extends: EventTarget,

    initialize: function(browser, options) {
        EventTarget.prototype.initialize.call(this, options);

        this.browser = browser;
        this.progress = new ProgressListener(this);
        this.browser.addProgressListener(this.progress,
            WPL.NOTIFY_STATE_ALL | WPL.NOTIFY_LOCATION
        );

        // Emit base events
        this.on('statechange', function(progress, request, flags, status, isMain) {
            if (!isMain) {
                return;
            }

            let isSuccess = components.isSuccessCode(request.status);

            if (this.isStart(flags)) {
                emit(this, 'loadstarted', request.URI.spec);
            }
            else if (this.isTransferring(flags)) {
                emit(this, 'transferstarted', request.URI.spec);
            }
            else if (this.isStopped(flags)) {
                if (!isSuccess) {
                    // Send contentloaded with status false
                    emit(this, 'contentloaded', false, request.URI.spec);
                }
                emit(this, 'loadstopped', isSuccess, request.URI.spec);
            }
            else if (this.isLoaded(flags)) {
                emit(this, 'loadfinished', isSuccess, request.URI.spec);
            }
        });

        this.on('locationchange', function(progress, request, location, flags, isMain) {
            if (!isMain) {
                return;
            }

            if (this.isURLError(flags)) {
                emit(this, 'urlerror', location.spec);
            }
            else {
                emit(this, 'urlchanged', location.spec);
            }
        });

        // We need to emit contentloaded based on actual DOMContentLoaded event
        this.on('transferstarted', function(url) {
            let loaded = function() {
                this.browser.removeEventListener('DOMContentLoaded', loaded, true);
                emit(this, 'contentloaded', true, url);
            }.bind(this);
            this.browser.addEventListener('DOMContentLoaded', loaded, true);
        });
    },

    stop: function() {
        if (typeof(this.browser.removeProgressListener) === 'function') {
            this.browser.removeProgressListener(this.progress);
        }
        this.progress = null;
    },

    isStart: function(flags) {
        return (
            flags & WPL.STATE_START &&
            flags & WPL.STATE_IS_DOCUMENT &&
            flags & WPL.STATE_IS_WINDOW
        );
    },

    isTransferring: function(flags) {
        return (
            flags & WPL.STATE_TRANSFERRING &&
            flags & WPL.STATE_IS_REQUEST &&
            flags & WPL.STATE_IS_DOCUMENT
        );
    },

    isStopped: function(flags) {
        return (
            flags & WPL.STATE_STOP &&
            flags & WPL.STATE_IS_DOCUMENT
        );
    },

    isLoaded: function(flags) {
        return (
            flags & WPL.STATE_STOP &&
            flags & WPL.STATE_IS_NETWORK &&
            flags & WPL.STATE_IS_WINDOW
        );
    },

    isURLError: function(flags) {
        return flags & WPL.LOCATION_CHANGE_ERROR_PAGE;
    },

    debugFlags: function(flags) {
        // I'm keeping this very useful function instead of erasing it every time :)
        let res = [];

        let colors = {
            STATE_IS_REQUEST: 178,
            STATE_IS_DOCUMENT: 201,
            STATE_IS_NETWORK: 39,
            STATE_IS_WINDOW: 204,
            STATE_START: 46,
            STATE_STOP: 196,
            STATE_TRANSFERRING: 207
        }

        for (var i in WPL) {
            if ((i.indexOf('STATE_') === 0 || i.indexOf('LOCATION_') === 0) && flags & WPL[i]) {
                if (i in colors) {
                    i = '\x1b[38;5;' + colors[i] + 'm' + i + '\x1b[0m';
                }
                res.push(i);
            }
        }
        return res && res.join(', ') || flags;
    }
});


const ProgressListener = function(target) {
    this.target = target;
};
ProgressListener.prototype = {
    QueryInterface: function(aIID){
        if (aIID.equals(Ci.nsIWebProgressListener) ||
            aIID.equals(Ci.nsISupportsWeakReference) ||
            aIID.equals(Ci.nsISupports))
            return this;
       throw(Cr.NS_NOINTERFACE);
    },

    _isFromMainWindow: function(progress, request) {
        let notificationCallbacks =
                request.notificationCallbacks ? request.notificationCallbacks : request.loadGroup.notificationCallbacks;

        if (!notificationCallbacks) {
            return false;
        }

        try {
            if(notificationCallbacks.getInterface(Ci.nsIXMLHttpRequest)) {
                // ignore requests from XMLHttpRequest
                return false;
            }
        }
        catch(e) { }

        try {
            let loadContext = notificationCallbacks.getInterface(Ci.nsILoadContext);
            if (loadContext.isContent && this.target.browser.contentWindow == loadContext.associatedWindow) {
                return true;
            }
        }
        catch (e) {}

        return false;
    },

    onLocationChange: function(progress, request, location, flags) {
        try {
            request.QueryInterface(Ci.nsIHttpChannel);
        }
        catch(e) {
            return
        }

        emit(this.target, 'locationchange',
            progress, request, location, flags, this._isFromMainWindow(progress, request)
        );
    },

    onStateChange: function(progress, request, flags, status) {
        try {
            request.QueryInterface(Ci.nsIHttpChannel);
        }
        catch(e) {
            return
        }

        emit(this.target, 'statechange',
            progress, request, flags, status, this._isFromMainWindow(progress, request)
        );
    },

    onStatusChange: function(progress, request, status, message) {
    },
    onSecurityChange : function(progress, request, state) {
    },
    debug : function(progress, request) {
    },
    onProgressChange: function (progress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) {
    }
};
