Jetpack net-log
===============

Jetpack net-log is a package for Mozilla Addon-SDK that provides a easy way to use network resource tracer and page progress events.

Installation
------------

Jetpack net-log is a Mozilla Addon-SDK package (not an extension). Just copy this repository to the `packages` directory of your extension or package. Then, add the following line in your `package.json` file:

```json
{
  //...
  "dependencies": ["net-log"]
}
```

Resource tracer
---------------

Network resource tracer is available by requiring `net-log/net-log`. It provides the following functions:


### registerBrowser(browser [,options])

Registers a new browser element. All network requests associated with the provided XUL Browser instance, `browser`, will be handled by events.

**Note:** if you call `registerBrowser` twice with the same `browser` argument, it will override the last registration.


#### Events

##### request (request)

This event is emitted when a request starts. It received a `request` object.

##### response (response)

This event is emitted when a response is received, at every step of a response (when it starts, when data comes in and when it stops). It received a `response` object.

##### startrequest ({nsIChannel} request)

This raw event is emitted when a request starts and received a nsIChannel instance. This is the place to tamper data if you need to.

##### startresponse ({nsIChannel} request, context)

This raw event is emitted when a response starts.

##### dataavailable ({nsIChannel} request, context, data, offset, count)

This raw event is emitted when data are available.

##### stopresponse ({nsIChannel} request, context, statusCode)

This raw event is emitted when a response stops.

**Note:** `options` parameter can take any event as a callback with `on` suffix. For example:

```js
registerBrowser(browser, {
    onRequest: function(request) {
        console.log(request.url);
    }
});
```


#### Request and Response objects

##### request

This object is received by `onRequest` callback. It contains the following properties:

 * `id`: the number of the requested resource
 * `method`: http method
 * `url`: the URL of the requested resource
 * `time`: Date object containing the date of the request
 * `headers`: list of http headers

##### response

This object is received by `onResponse` callback. It contains the following properties:

 * `id`: the number of the requested resource
 * `url`: the URL of the requested resource
 * `time`: Date object containing the date of the response
 * `headers`: list of http headers
 * `bodySize`: size of the received content (entire content or chunk content)
 * `contentType`: the content type if specified
 * `contentCharset`: the charset of the content if specified
 * `redirectURL`: if there is a redirection, the redirected URL
 * `stage`: `start`, `data` or `end`
 * `status`: http status code. ex: `200`
 * `statusText`: http status text. ex: `OK`
 * `referrer`: the resource referrer

**Note:** Response object contains an additional `data` property on stage `data`.


### getListener(browser)

Returns a registered listener registered for provided browser. If no browser is registered, it returns `null`. It is a convenient way to "get or create":

```js
let netlog = getListener(browser) || registerBrowser(browser);
```


### unregisterBrowser(browser)

Removes the browser from tracer.


### startTracer()

This function registers observers needed to activate resource tracer. It is now activated when you call `registerBrowser` for the first time.

### stopTracer()

This function unregisters tracer observers.


### Simple example

Somehow, you have a XUL browser instance.

```js
let netlog = registerBrowser(browser, {
    // Handle request event in options
    onRequest: function(request) {
        console.log('REQUEST', '\t', request.url);
    }
});

// Add a response handler
netlog.on('response', function(response) {
    console.log('RESPONSE', '\t', response.status, response.url);
});

//...
// If you want to remove a event listener:
netlog.removeListener('response', myFunction);
```


Page progress
-------------

Page progress tracker is available by requiring `net-log/page-progress` and provides the following functions:


### registerBrowser(browser [,options])

Registers a new browser element. It returns a event target instance on which you can add event handlers. As in `net-log.registerBrowser` you can pass event handlers in `options` with a `on` prefix.

#### Events

##### loadstarted (url)

This event is emitted when load was asked.

##### transferstarted (url)

This event is emitted when page transfer starts.

##### contentloaded (status, url)

This event is emitted when page content is loaded. This is the equivalent event of `DOMContentLoaded` window event. `status` is a boolean indicating success or failure of loading.

##### loadfinished (status, url)

This event is emitted when the whole page is loaded. This is the equivalent event of `load` window event. `status` is a boolean indicating success or failure of loading.

##### urlerror (url)

This event is emitted if something went wrong while loading page. It could be a network error or a bad SSL certificate. Note that HTTP status code as nothing to do with the status.

##### urlchanged (url)

This event is emitted on any URL change but error.

##### statechange (progress, {nsIChannel} request, flags, status, isMain)

This raw event is called anytime progress listener state changes. `isMain` indicates if event comes from main window.

##### locationchange (progress, {nsIChannel} request, location, flags, isMain)

This raw event is called when location changes. `isMain` indicates if event comes from main window.

##### statuschange (progress, {nsIChannel} request, status, message, isMain)

This raw event is called on status change `isMain` indicates if event comes from main window.


### unregisterBrowser(browser)

Removes the browser from page progress listener.


### getListener(browser)

Returns a registered listener registered for provided browser. If no browser is registered, it returns `null`. It is a convenient way to "get or create":

```js
let netlog = getListener(browser) || registerBrowser(browser);
```


Examples
--------

### Get page source code

To get a page source code, we'll need to combine net-log and page-progress.

```js
'use strict';

const tabBrowser = require("sdk/deprecated/tab-browser");

const NetLog = require("net-log/net-log");
const PageProgress = require("net-log/page-progress");

exports.main = function() {
    tabBrowser.TabTracker({
        onTrack: function(tab) {
            // On every tab we start a page-progress
            let source;
            let p = PageProgress.registerBrowser(tab.linkedBrowser);
            p.on('loadstarted', function() {
                // When load starts, we start net-log
                source = '';
                NetLog.registerBrowser(tab.linkedBrowser, {
                    onResponse: function(response) {
                        // Note: event in case of redirect, data would be available in
                        // first resource, which is very convenient :)
                        if (response.stage === 'data' && response.id === 0) {
                            source += response.data;
                        }
                    }
                });
                //
                // "this" is our event target instance ("p" in this case) and yes,
                // you can use "once"
                this.once('contentloaded', function() {
                    // Content is loaded, remove net-log and show source code. Voilà!
                    NetLog.unregisterBrowser(tab.linkedBrowser);
                    console.log(source);
                });
            });
        },
        onUntrack: function(tab) {
            // When tab is removed, we remove page-progress
            PageProgress.unregisterBrowser(tab.linkedBrowser);
        }
    });
};
```
