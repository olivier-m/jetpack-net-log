"use strict";

const {Cc, Ci} = require("chrome");
const Q = require("sdk/core/promise");
const {setTimeout} = require("sdk/timers");
const {URL} = require("sdk/url");
const {getBrowserForTab, getOwnerWindow} = require("sdk/tabs/utils");

const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

const {registerBrowser, unregisterBrowser, startTracer} = require("net-log");

const {readBinaryURI, registerFile, startServer} = require("./utils");

const port = 8099;

let srv = startServer(port, URL("fixtures/", module.uri).toString(), [
    "01.html",
    "02.html",
    "03.html",
    "test.js",
    "test.css",
    "image.jpg",
    "nyan.gif"
]);
srv.registerPathHandler("/redir", function(request, response) {
    response.setStatusLine(request.httpVersion, 301, "Moved Permanently");
    response.setHeader("Location", "03.html", false);  // No FQDN redirect on purpose
    response.processAsync();
    response.write("");
    response.finish();
});

startTracer();

const pageURL = function(path) {
    return "http://127.0.0.1:" + port + path;
};

const openTab = function() {
    let win = wm.getMostRecentWindow("navigator:browser");
    let container = win.gBrowser.tabContainer;

    let d1 = Q.defer();
    container.addEventListener("TabOpen", function _open(evt) {
        container.removeEventListener("TabOpen", _open, true);
        d1.resolve({
            tab: evt.target,
            browser: getBrowserForTab(evt.target)
        });
    }, true);

    let tab = win.gBrowser.addTab();

    return d1.promise.then(function(result) {
        let {browser, tab} = result;

        let close = function() {
            let D = Q.defer();
            container.addEventListener("TabClose", function _close() {
                container.removeEventListener("TabClose", _close, true);
                D.resolve();
            }, true);
            getOwnerWindow(tab).gBrowser.removeTab(tab);

            return D;
        };

        let open = function(url) {
            let D = Q.defer();
            browser.addEventListener("load", function _load() {
                browser.removeEventListener("load", _load, true);
                setTimeout(function() {
                    D.resolve({
                        url: url,
                        tab: tab,
                        browser: browser,
                        close: close
                    });
                }, 500);
            }, true);

            browser.loadURI(url);
            return D.promise;
        }

        return {
            tab: tab,
            browser: browser,
            open: open,
            close: close
        }
    });
};

exports["test one resource"] = function(assert, done) {
    let reqs = [];
    let started = [];
    let seen = [];

    openTab()
    .then(function(result) {
        registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                response.stage == "end" && seen.push(response) || started.push(response);
            }
        });
        return result.open(pageURL("/01.html"));
    })
    .then(function(result) {
        unregisterBrowser(result.browser);
        assert.equal(reqs.length, 1);
        assert.equal(started.length, 1);
        assert.equal(seen.length, 1);

        let request = reqs[0];
        let response = seen[0];

        assert.equal(request.id, 0);
        assert.equal(request.url, result.url);
        assert.equal(request.method, "GET");
        assert.ok(request.headers.length > 0);

        assert.equal(response.id, 0);
        assert.equal(response.url, result.url);
        assert.equal(response.contentType, "text/html");
        assert.equal(response.contentCharset, "utf-8");
        assert.equal(response.redirectURL, null);
        assert.equal(response.stage, "end");
        assert.equal(response.status, 200);
        assert.equal(response.statusText, "OK");
        assert.ok(response.bodySize > 0);
        assert.equal(response.body.length, response.bodySize);

        let contentType = response.headers.filter(function(v) {
            return v.name == "Content-Type";
        });
        assert.equal(contentType.length, 1);
        assert.equal(contentType[0].value, "text/html; charset=utf-8");

        return result.close();
    })
    .then(done);
};

exports["test two resources"] = function(assert, done) {
    let reqs = [];
    let started = [];
    let seen = [];

    openTab()
    .then(function(result) {
        registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                response.stage == "end" && seen.push(response) || started.push(response);
            }
        });
        return result.open(pageURL("/02.html"));
    })
    .then(function(result) {
        unregisterBrowser(result.browser);
        assert.equal(reqs.length, 2);
        assert.equal(started.length, 2);
        assert.equal(seen.length, 2);
        assert.equal(reqs[1].url, pageURL("/test.js"));
        assert.equal(seen[1].url, pageURL("/test.js"));

        assert.equal(seen[0].body.length, seen[0].bodySize);
        assert.ok(seen[1].body.length == 0);

        return result.close();
    })
    .then(done);
};

exports["test many resources"] = function(assert, done) {
    let reqs = [];
    let started = [];
    let seen = [];

    openTab()
    .then(function(result) {
        registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                response.stage == "end" && seen.push(response) || started.push(response);
            },
            captureTypes: [
                /^text\/css/
            ]
        });
        return result.open(pageURL("/03.html"));
    })
    .then(function(result) {
        unregisterBrowser(result.browser);
        assert.equal(reqs.length, 5);
        assert.equal(started.length, 5);
        assert.equal(seen.length, 5);

        let jpg = seen.filter(function(response) {
            return response.url == pageURL("/image.jpg");
        });
        assert.equal(jpg.length, 1);
        jpg = jpg[0];
        assert.equal(jpg.contentType, "image/jpeg");
        assert.ok(jpg.bodySize > 0);
        assert.ok(jpg.imageInfo.width > 0);
        assert.ok(jpg.imageInfo.height > 0);
        assert.ok(!jpg.imageInfo.animated);

        let gif = seen.filter(function(response) {
            return response.url == pageURL("/nyan.gif");
        });
        //assert.equal(gif.length, 1);
        gif = gif[0];
        assert.equal(gif.contentType, "image/gif");
        assert.ok(gif.bodySize > 0);
        assert.ok(gif.imageInfo.width > 0);
        assert.ok(gif.imageInfo.height > 0);
        assert.ok(gif.imageInfo.animated);

        let css = seen.filter(function(response) {
            return response.url == pageURL("/test.css");
        });
        assert.equal(css.length, 1);
        css = css[0];
        assert.ok(css.contentType.indexOf("text/css") === 0);
        assert.ok(css.bodySize > 0);

        // Check capture
        assert.equal(seen[0].body.length, seen[0].bodySize);
        assert.equal(css.body.length, css.bodySize);

        return result.close();
    })
    .then(done);
};

exports["test redirect"] = function(assert, done) {
    let reqs = [];
    let started = [];
    let seen = [];

    openTab()
    .then(function(result) {
        registerBrowser(result.browser, {
            onRequest: function(request) {
                reqs.push(request);
            },
            onResponse: function(response) {
                response.stage == "end" && seen.push(response) || started.push(response);
            }
        });
        return result.open(pageURL("/redir"));
    })
    .then(function(result) {
        unregisterBrowser(result.browser);

        assert.equal(reqs.length, 6);
        assert.equal(seen.length, 6);
        assert.equal(started.length, 6);
        assert.equal(reqs[0].url, result.url);
        assert.equal(seen[0].url, result.url);

        assert.equal(seen[0].redirectURL, pageURL("/03.html"));
        assert.equal(seen[0].status, 301);
        assert.equal(seen[0].body.length, 0);

        assert.equal(seen[1].url, result.browser.contentWindow.location.href);
        assert.equal(seen[1].status, 200);
        assert.equal(seen[1].body.length, seen[1].bodySize);

        return result.close();
    })
    .then(done);
};

require("test").run(exports);
