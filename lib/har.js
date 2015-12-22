'use strict';

const {emit} = require('sdk/event/core');
const self = require('sdk/self');
const system = require('sdk/system');
const {setTimeout} = require('sdk/timers');

const {validateOptions} = require('sdk/deprecated/api-utils');

const NetLog = require('./net-log');
const PageProgress = require('./page-progress');
const {getImageInfo} = require('./utils');

const RE_IMG = /^image\/(?!svg)/;

/**
 * @param XULElement browser
 */
const startCollector = function(browser, options) {
    let requirements = {
        'autoStart': {
            map: (v) => typeof(v) === 'boolean' ? v : true
        },
        'wait': {
            map: (v) => { return parseInt(v) || 0 }
        },
        'captureTypes': {
            map: (v) => { return Array.isArray(v) && v || []}
        },
        'withImageInfo': {
            map: (v) => !!v
        }
    };
    options = validateOptions(options || {}, requirements);

    let startTime, currentURL,
        resourceStack = {};

    let result = {
        'version': '1.2',
        'creator': {
            'name': self.name,
            'version': self.version
        },
        'browser': {
            'name': system.name,
            'version': system.version
        },
        'pages': [],
        'entries': []
    };

    let onStart = function(url) {
        startTime = new Date();
        currentURL = url;

        result.pages.push({
            'startedDateTime': startTime.toISOString(),
            'id': currentURL,
            'title': '',
            'pageTimings': {
                'onContentLoad': -1,
                'onLoad': -1
            }
        });
    };
    let onLoaded = function(status, url) {
        let pID = result.pages.length - 1;
        result.pages[pID].title = this.browser.contentTitle;
        result.pages[pID].pageTimings.onContentLoad = new Date() - startTime;
    };
    let onFinished = function(status, url) {
        let pID = result.pages.length - 1;
        if (pID >= 0) {
            result.pages[pID].pageTimings.onLoad = new Date() - startTime;
        }

        let emitEvent = function() {
            emit(PL, 'collectfinish');
        }

        if (options.wait > 0) {
            setTimeout(emitEvent, options.wait);
        } else {
            emitEvent();
        }
    };

    let onRequest = function(request) {
        resourceStack[request.id] = {
            request: request,
            start: null,
            end: null,
            data: []
        };
    };

    let onResponse = function(response) {
        let withImageInfo = (
            options.withImageInfo &&
            RE_IMG.test(response.contentType) &&
            (response.stage === 'data' || response.stage === 'end')
        );

        if (typeof(resourceStack[response.id]) === 'undefined') {
            return;
        }

        if (response.stage === 'start') {
            resourceStack[response.id].start = response;
        } else if (response.stage === 'data') {
            if (withImageInfo || shouldCapture(response)) {
                resourceStack[response.id].data.push(response.data);
            }
        } else if (response.stage === 'end') {
            resourceStack[response.id].end = response;
            if (withImageInfo) {
                resourceStack[response.id].imageInfo = getImageInfo(
                    resourceStack[response.id].data.join(''),
                    response.contentType, response.url
                );
            }

            if (resourceStack[response.id].start !== null &&
                resourceStack[response.id].end !== null)
            {
                result.entries.push(createEntry(resourceStack[response.id]));
                result.entries.sort((a, b) => a._id > b._id);
            }
            delete(resourceStack[response.id]);
        }
    };

    let createEntry = function(r) {
        let mimeType = '',
            contentLength = null;

        r.end.headers.forEach(function(val) {
            if (val.name.toLowerCase() === 'content-type') {
                mimeType = val.value;
            }
            if (val.name.toLowerCase() === 'content-length') {
                contentLength = parseInt(val.value) || null;
            }
        });

        let entry = {
            '_id': r.end.id,
            '_url': r.end.url,
            'pageref': currentURL,
            'startedDateTime': r.request.time.toISOString(),
            'time': r.end.time - r.request.time,
            'request': {
                'method': r.request.method,
                'url': r.request.url,
                'httpVersion': 'HTTP/1.1',
                'cookied': [],
                'headers': r.request.headers,
                'queryString': [],
                'postData': {},
                'headerSize': -1,
                'bodySize': -1
            },
            'response': {
                'status': r.end.status,
                'statusText': r.end.statusText,
                'httpVersion': 'HTTP/1.1',
                'cookies': [],
                'headers': r.end.headers,
                'content': {
                    'size': r.end.bodySize,
                    'compression': contentLength !== null ? (r.end.bodySize - contentLength) : undefined,
                    'mimeType': mimeType,
                    'text': shouldCapture(r.end) && r.data.join('') || ''
                },
                'redirectURL': r.end.redirectURL || '',
                'headersSize': -1,
                'bodySize': r.end.bodySize,
                '_contentType': r.end.contentType,
                '_contentCharset': r.end.contentCharset,
                '_referrer': r.end.referrer,
                '_imageInfo': r.imageInfo || undefined
            },
            'cache': {},
            'timings': {
                'send': 0,
                'wait': r.start.time - r.request.time,
                'receive': r.end.time - r.start.time
            }
        };

        emit(PL, 'harentry', entry, r.request, r.start, r.end, r.data.join(''));
        return entry;
    };

    let shouldCapture = function(response) {
        return options.captureTypes.some(function(v) {
            try {
                return v.test(response.contentType);
            }
            catch(e) {}
            return false;
        });
    };

    let PL = PageProgress.getListener(browser) || PageProgress.registerBrowser(browser);
    let NL = NetLog.getListener(browser) || NetLog.registerBrowser(browser);

    let start = function(url) {
        stop();
        PL.on('loadstarted', onStart);
        PL.on('contentloaded', onLoaded);
        PL.on('loadfinished', onFinished);
        NL.on('request', onRequest);
        NL.on('response', onResponse);

        if (typeof(url) !== 'undefined') {
            onStart(url);
        }
    };

    let stop = function() {
        PL.removeListener('loadstarted', onStart);
        PL.removeListener('contentloaded', onLoaded);
        PL.removeListener('loadfinished', onFinished);
        NL.removeListener('request', onRequest);
        NL.removeListener('response', onResponse);
        reset();
    };

    let reset = function() {
        result.pages = [];
        result.entries = [];
        resourceStack = {};
        NL.flush();
    };

    if (options.autoStart) {
        start();
    }

    return {
        data: result,
        listener: PL,
        start: start,
        stop: stop,
        reset: reset
    };
};
exports.startCollector = startCollector;
