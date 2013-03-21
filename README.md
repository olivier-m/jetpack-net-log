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


##### modifyrequest ({nsIChannel} request)

This raw event is emitted when a request starts and receives a nsIChannel instance. This is the place to tamper data if you need to.

##### examineresponse ({nsIChannel} request)

This raw event is emitted when a response is about to start (before TracingListener init) and receives a nsIChannel instance.

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


##### loadstopped (status, url)

This event is emitted when browser stopped loading page. It happens juste before loadfinished.


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


Extra: HAR collector
--------------------

Net-log provides an utility lib to collect page and request information in [HAR format](http://www.softwareishard.com/blog/har-12-spec/). Module `net-log/har` provides the following function:


### startCollector(browser [,options])

This function starts collecting HAR data for provided `browser`. It returns a object with the following properties and methods:

- `data`: Collected data.
- `listener`: Reference to the page-progress listener instance.
- `start()`: Starts collector. Could take an `url` parameter (see example).
- `stop()`: This function stops collector.
- `reset()`: This function resets `data` property.

**Note:** Don't forget to stop any net-log and page-progress instances when needed.


#### Options

`options` is an object with the following properties:

- `autoStart`: Start collector immediately. Default to `true`.
- `wait`: see `collectfinish` event.
- `captureTypes`: An array of RegExp matching content-type you want to capture.
- `withImageInfo`: If true, provides a property `_imageInfo` for images in responses.


#### Data

`data` object is populated on the fly and never emptied unless you ask for `reset()`. Thus you can record a complete session on a website and stop it whenever you want.

`data` is conform to HAR format 1.2 with some additional fields:

- `entries[X]._url`: Shorthand to `entries[X].request.url
- `entries[X].response._contentType`: Content-Type without charset
- `entries[X].response._contentCharset`: Content Charset
- `entries[X].response._referrer`: Referrer URL
- `entries[X].response._imageInfo`: Defined if resource is an image and `withImageInfo` option was set to `true` and contains `width`, `height` and `animated` properties.


#### Events

All events are emited on page-progress instance (collector `listener` property).


##### collectfinish

This event is emitted when a page load was finish (plus a waiting time if specified by `options.wait`.

##### harentry (entry, request, responseStart, responseEnd, responseData)

This event allows you to get and manipulate HAR entries on the fly. Here is an example:

```js
collector.listener.on('harentry', function(entry, req, rStart, rEnd, data) {
    entry.response._foolishValue = entry.response.bodySize * 2;
});
```


Examples
--------

### Get page source code

To get a page source code, we'll need to combine net-log and page-progress.

```js
'use strict';

const tabBrowser = require('sdk/deprecated/tab-browser');

const NetLog = require('net-log/net-log');
const PageProgress = require('net-log/page-progress');

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


### Collect HAR data on each page load

Let's collect HAR data for each tab.

```js
'use strict';

const tabBrowser = require("sdk/deprecated/tab-browser");

const NetLog = require("net-log/net-log");
const PageProgress = require("net-log/page-progress");
const Har = require("net-log/har");

exports.main = function() {
    // A WeakMap to store HAR information for each browser
    let harEntries = new WeakMap();

    tabBrowser.TabTracker({
        onTrack: function(tab) {
            let collector = Har.startCollector(tab.linkedBrowser, {
                autoStart: false,     // We start manually
                wait: 1000,           // Wait 1s before collectfinish event
                withImageInfo: true,  // Who doesn't want image information?
                captureTypes: [
                    /text\/css/       // We want to capture CSS contents
                ]
            });

            // Set our harEntries value
            harEntries.set(tab.linkedBrowser, []);

            collector.listener.on('loadstarted', function(url) {
                // We pass url to trigger loadstarted callback as it this case it would
                // never be called
                collector.start(url);
            });

            collector.listener.on('collectfinish', function() {
                // Keep a copy of entries
                harEntries.set(tab.linkedBrowser, [].slice.call(collector.data.entries));
                // Stop collecting now
                collector.stop();

                // You can now use entries
                console.log(JSON.stringify(harEntries.get(tab.linkedBrowser), null, 2));
            });
        },
        onUntrack: function(tab) {
            PageProgress.unregisterBrowser(tab.linkedBrowser);
            NetLog.unregisterBrowser(tab.linkedBrowser);
            harEntries.has(tab.linkedBrowser) && harEntries.delete(tab.linkedBrowser);
        }
    });
};
```
