'use strict';

const {URL} = require('sdk/url');

const NetLog = require('net-log/net-log');
const PageProgress = require('net-log/page-progress');
const {getImageInfo} = require('net-log/utils');

const {openTab, startServer} = require('./tools');

const port = 8099;

let srv = startServer(port, URL('fixtures/', module.uri).toString(), [
    '01.html',
    '02.html',
    '03.html',
    '03_iframe.html',
    'test.js',
    'test.css',
    'image.jpg',
    'nyan.gif',
    'hello.txt',
    'helloframe.css'
]);
srv.registerPathHandler('/@redir', function(request, response) {
    response.setStatusLine(request.httpVersion, 301, 'Moved Permanently');
    response.setHeader('Location', '03.html', false);  // No FQDN redirect on purpose
    response.processAsync();
    response.write('');
    response.finish();
});
srv.registerPathHandler('/@404', function(request, response) {
    response.setStatusLine(request.httpVersion, 404, 'Not Found');
    response.setHeader('Content-Type', 'text/plain; charset=UTF-8');
    response.processAsync();
    response.write('');
    response.finish();
});


const pageURL = function(path) {
    return 'http://127.0.0.1:' + port + path;
};


exports['test one resource'] = function(assert, done) {
    let reqs = [];
    let stages = {
        start: [],
        data: [],
        end: []
    };

    openTab()
    .then(function(result) {
        NetLog.registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                stages[response.stage].push(response);
            }
        });
        return result.open(pageURL('/01.html'));
    })
    .then(function(result) {
        NetLog.unregisterBrowser(result.browser);
        assert.equal(reqs.length, 1);
        assert.equal(stages.start.length, 1);
        assert.equal(stages.end.length, 1);
        assert.ok(stages.data.length >= stages.end.length);

        let request = reqs[0];
        let response = stages.end[0];
        let data = stages.data.filter((r) => r.id === 0).map((r) => r.data).join('');

        assert.equal(request.id, 0);
        assert.equal(request.url, result.url);
        assert.equal(request.method, 'GET');
        assert.ok(request.headers.length > 0);

        assert.equal(response.id, 0);
        assert.equal(response.url, result.url);
        assert.equal(response.contentType, 'text/html');
        assert.equal(response.contentCharset, 'utf-8');
        assert.equal(response.redirectURL, null);
        assert.equal(response.stage, 'end');
        assert.equal(response.status, 200);
        assert.equal(response.statusText, 'OK');
        assert.ok(response.bodySize > 0);

        assert.equal(data.length, response.bodySize);

        let contentType = response.headers.filter(function(v) {
            return v.name == 'Content-Type';
        });
        assert.equal(contentType.length, 1);
        assert.equal(contentType[0].value, 'text/html; charset=utf-8');

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};

exports['test two resources'] = function(assert, done) {
    let reqs = [];
    let stages = {
        start: [],
        data: [],
        end: []
    };
    let trace = [];

    openTab()
    .then(function(result) {
        let nl = NetLog.registerBrowser(result.browser);
        nl.on('request', function(request) {
            reqs.push(request);
        });
        nl.on('response', function(response) {
            stages[response.stage].push(response);
        });

        let pl = PageProgress.registerBrowser(result.browser);
        pl.on('loadstarted', function(status, url) {
            trace.push('LOAD STARTED', result.browser.contentWindow.location.href);
        });
        pl.on('transferstarted', function(status, url) {
            trace.push('TRANSFER STARTED');
        });
        pl.on('contentloaded', function(status, url) {
            trace.push('CONTENT LOADED', status);
        });
        pl.on('loadfinished', function(status, url) {
            trace.push('LOAD FINISHED', status);
        });
        pl.on('urlchanged', function(url) {
            trace.push('URLCHANGED', url);
        });

        return result.open(pageURL('/02.html'));
    })
    .then(function(result) {
        NetLog.unregisterBrowser(result.browser);
        PageProgress.unregisterBrowser(result.browser);

        assert.equal(reqs.length, 2);
        assert.equal(stages.start.length, 2);
        assert.equal(stages.end.length, 2);
        assert.ok(stages.data.length >= stages.end.length);
        assert.equal(reqs[1].url, pageURL('/test.js'));
        assert.equal(stages.end[1].url, pageURL('/test.js'));

        assert.deepEqual(trace, [
            'LOAD STARTED', 'about:blank',
            'URLCHANGED', pageURL('/02.html'),
            'TRANSFER STARTED',
            'CONTENT LOADED', true,
            'LOAD FINISHED', true
        ]);

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};

exports['test many resources'] = function(assert, done) {
    let reqs = [];
    let stages = {
        start: [],
        data: [],
        end: []
    };
    let trace = [];

    openTab()
    .then(function(result) {
        NetLog.registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                stages[response.stage].push(response);
            }
        });

        PageProgress.registerBrowser(result.browser, {
            onLoadStarted: function() {
                trace.push('LOAD STARTED', result.browser.contentWindow.location.href);
            },
            onURLChanged: function(url) {
                trace.push('URLCHANGED', url);
            },
            onTransferStarted: function() {
                trace.push('TRANSFER STARTED');
            },
            onContentLoaded: function(status) {
                trace.push('CONTENT LOADED', status);
            },
            onLoadFinished: function(status) {
                trace.push('LOAD FINISHED', status);
            }
        });

        return result.open(pageURL('/03.html'));
    })
    .then(function(result) {
        NetLog.unregisterBrowser(result.browser);
        PageProgress.unregisterBrowser(result.browser);

        assert.equal(reqs.length, 8);
        assert.equal(stages.start.length, 8);
        assert.equal(stages.end.length, 8);
        assert.ok(stages.data.length >= stages.end.length);

        assert.deepEqual(trace, [
            'LOAD STARTED', 'about:blank',
            'URLCHANGED', pageURL('/03.html'),
            'TRANSFER STARTED',
            'CONTENT LOADED', true,
            'LOAD FINISHED', true
        ]);

        let jpg = stages.end.filter((r) => r.url === pageURL('/image.jpg'));
        assert.equal(jpg.length, 1);
        jpg = jpg[0];
        assert.equal(jpg.contentType, 'image/jpeg');
        assert.ok(jpg.bodySize > 0);

        let gif = stages.end.filter((r) => r.url == pageURL('/nyan.gif'));
        assert.equal(gif.length, 1);
        gif = gif[0];
        assert.equal(gif.contentType, 'image/gif');
        assert.ok(gif.bodySize > 0);

        let css = stages.end.filter((r) => r.url === pageURL('/test.css'));

        assert.equal(css.length, 1);
        css = css[0];
        assert.ok(css.contentType.indexOf('text/css') === 0);
        assert.ok(css.bodySize > 0);

        // Check capture
        let mainBody = stages.data.filter((r) => r.id === 0).map((r) => r.data).join('');
        let cssBody = stages.data.filter((r) => r.url === pageURL('/test.css'))
                        .map((r) => r.data)
                        .join('');

        assert.equal(mainBody.length, stages.end[0].bodySize);
        assert.equal(cssBody.length, css.bodySize);

        let iframe = stages.end.filter(function(response) {
            return response.url == pageURL('/03_iframe.html');
        });
        assert.equal(iframe.length, 1);
        assert.ok(iframe[0].contentType.indexOf('text/html') === 0);
        assert.ok(iframe[0].bodySize > 0);

        let iframecss = stages.end.filter(function(response) {
            return response.url == pageURL('/helloframe.css');
        });
        assert.equal(iframecss.length, 1);
        assert.ok(iframecss[0].contentType.indexOf('text/css') === 0);
        assert.ok(iframecss[0].bodySize > 0);

        let xhr = stages.end.filter(function(response) {
            return response.url == pageURL('/hello.txt');
        });
        assert.equal(xhr.length, 1);
        assert.ok(xhr[0].contentType.indexOf('text/plain') === 0);
        assert.ok(xhr[0].bodySize > 0);

        // Image capture
        let jpgBody = stages.data.filter((r) => r.url === jpg.url)
                        .map((r) => r.data)
                        .join('');
        let jpgInfo = getImageInfo(jpgBody, jpg.contentType, jpg.url);

        let gifBody = stages.data.filter((r) => r.url === gif.url)
                        .map((r) => r.data)
                        .join('');
        let gifInfo = getImageInfo(gifBody, gif.contentType, gif.url);

        assert.equal(jpg.bodySize, jpgBody.length);
        assert.ok(jpgInfo.width > 0);
        assert.ok(jpgInfo.height > 0);
        assert.ok(!jpgInfo.animated);

        assert.equal(gif.bodySize, gifBody.length);
        assert.ok(gifInfo.width > 0);
        assert.ok(gifInfo.height > 0);
        assert.ok(gifInfo.animated);

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};

exports['test unknown page'] = function(assert, done) {
    let reqs = [];
    let stages = {
        start: [],
        data: [],
        end: []
    };
    let trace = [];

    openTab()
    .then(function(result) {
        NetLog.registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                stages[response.stage].push(response);
            }
        });

        PageProgress.registerBrowser(result.browser, {
            onLoadStarted: function() {
                trace.push('LOAD STARTED', result.browser.contentWindow.location.href);
            },
            onURLChanged: function(url) {
                trace.push('URLCHANGED', url);
            },
            onTransferStarted: function() {
                trace.push('TRANSFER STARTED');
            },
            onContentLoaded: function(status) {
                trace.push('CONTENT LOADED', status);
            },
            onLoadFinished: function(status) {
                trace.push('LOAD FINISHED', status);
            }
        });

        return result.open(pageURL('/@404'));
    })
    .then(function(result) {
        NetLog.unregisterBrowser(result.browser);
        PageProgress.unregisterBrowser(result.browser);

        assert.equal(reqs.length, 1);
        assert.equal(stages.start.length, 1);
        assert.equal(stages.end.length, 1);
        assert.equal(stages.end[0].status, 404);

        assert.deepEqual(trace, [
            'LOAD STARTED', 'about:blank',
            'URLCHANGED', pageURL('/@404'),
            'TRANSFER STARTED',
            'CONTENT LOADED', true,
            'LOAD FINISHED', true
        ]);

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};

exports['test redirect'] = function(assert, done) {
    let reqs = [];
    let stages = {
        start: [],
        data: [],
        end: []
    };
    let trace = [];

    openTab()
    .then(function(result) {
        NetLog.registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                stages[response.stage].push(response);
            }
        });

        PageProgress.registerBrowser(result.browser, {
            onLoadStarted: function() {
                trace.push('LOAD STARTED', result.browser.contentWindow.location.href);
            },
            onURLChanged: function(url) {
                trace.push('URLCHANGED', url);
            },
            onTransferStarted: function() {
                trace.push('TRANSFER STARTED');
            },
            onContentLoaded: function(status) {
                trace.push('CONTENT LOADED', status);
            },
            onLoadFinished: function(status) {
                trace.push('LOAD FINISHED', status);
            }
        });

        return result.open(pageURL('/@redir'));
    })
    .then(function(result) {
        NetLog.unregisterBrowser(result.browser);

        assert.equal(reqs.length, 9);
        assert.equal(stages.end.length, 9);
        assert.equal(stages.start.length, 9);
        assert.equal(reqs[0].url, result.url);
        assert.equal(stages.end[0].url, result.url);

        assert.deepEqual(trace, [
            'LOAD STARTED', 'about:blank',
            'URLCHANGED', pageURL('/03.html'),
            'TRANSFER STARTED',
            'CONTENT LOADED', true,
            'LOAD FINISHED', true
        ]);

        assert.equal(stages.end[0].redirectURL, pageURL('/03.html'));
        assert.equal(stages.end[0].status, 301);
        assert.equal(stages.end[0].bodySize, 0);

        assert.equal(stages.end[1].url, result.browser.contentWindow.location.href);
        assert.equal(stages.end[1].status, 200);

        let data = stages.data.filter((r) => r.id === 1).map((r) => r.data).join('');
        assert.equal(data.length, stages.end[1].bodySize);

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};

exports['test network error'] = function(assert, done) {
    let reqs = [];
    let stages = {
        start: [],
        data: [],
        end: []
    };
    let trace = [];

    openTab()
    .then(function(result) {
        NetLog.registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                stages[response.stage].push(response);
            }
        });

        PageProgress.registerBrowser(result.browser, {
            onLoadStarted: function() {
                trace.push('LOAD STARTED', result.browser.contentWindow.location.href);
            },
            onURLChanged: function(url) {
                trace.push('URLCHANGED', url);
            },
            onTransferStarted: function() {
                trace.push('TRANSFER STARTED');
            },
            onContentLoaded: function(status) {
                trace.push('CONTENT LOADED', status);
            },
            onLoadFinished: function(status) {
                trace.push('LOAD FINISHED', status);
            }
        });

        return result.open('http://truc.sdsdsd/unknown.html');
    })
    .then(function(result) {
        NetLog.unregisterBrowser(result.browser);
        PageProgress.unregisterBrowser(result.browser);

        assert.equal(result.loadFailed, true);

        assert.equal(reqs.length, 2);
        assert.equal(stages.start.length, 0);
        assert.equal(stages.end.length, 0);

        assert.equal(reqs[0].url, 'http://truc.sdsdsd/unknown.html');
        assert.equal(reqs[1].url, 'http://www.truc.sdsdsd/unknown.html');

        assert.deepEqual(trace, [
            'LOAD STARTED', 'about:blank',
            'CONTENT LOADED', false,
            'LOAD STARTED', 'about:blank',
            'LOAD FINISHED', false,
            'CONTENT LOADED', false,
            'LOAD FINISHED', false
        ]);

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};

exports['test har'] = function(assert, done) {
    const HarLib = require('net-log/har');
    let collector;

    openTab()
    .then(function(result) {
        collector = HarLib.startCollector(result.browser, {
            withImageInfo: true,
            captureTypes: [
                /^text\/css/
            ]
        });
        return result.open(pageURL('/01.html'));
    })
    .then(function(result) {
        assert.equal(collector.data.pages.length, 1);
        assert.equal(collector.data.entries.length, 1);
        return result.open(pageURL('/03.html'));
    })
    .then(function(result) {
        assert.equal(collector.data.pages.length, 2);
        assert.equal(collector.data.entries.length, 9);

        assert.equal(collector.data.pages[0].id, pageURL('/01.html'));
        assert.equal(collector.data.pages[1].id, pageURL('/03.html'));

        collector.reset();
        return result.open(pageURL('/03.html'));
    })
    .then(function(result) {
        assert.equal(collector.data.pages.length, 1);
        assert.equal(collector.data.entries.length, 8);

        assert.equal(collector.data.pages[0].id, pageURL('/03.html'));
        assert.equal(collector.data.entries[0]._url, pageURL('/03.html'));
        assert.equal(collector.data.entries[0]._id, 0);
        assert.equal(collector.data.entries[2]._url, pageURL('/test.css'));
        assert.equal(collector.data.entries[2].response.content.size, collector.data.entries[2].response.content.text.length);

        let nyan = collector.data.entries.filter((v) => v._url == pageURL('/nyan.gif'))[0];
        assert.deepEqual(nyan.response._imageInfo, {width:400, height:400, animated:true});

        collector.stop();
        return result.open(pageURL('/03.html'));
    })
    .then(function(result) {
        assert.equal(collector.data.pages.length, 0);
        assert.equal(collector.data.entries.length, 0);

        return result.close();
    })
    .then(null, console.exception)
    .then(done);
};
