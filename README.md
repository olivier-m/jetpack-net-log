Jetpack net-log
===============

Jetpack net-log is a package for Mozilla Addon-SDK that provides a easy to use network resource tracer (as Firebug does in network tab).

Installation
------------

Jetpack net-log is a Mozilla Addon-SDK package (not an extension). Just copy this repository to the `packages` directory of your extension or package. Then, add the following line in your `package.json` file:

```js
{
  //...
  "dependencies": ["net-log"]
}
```

Usage
-----

There are 4 functions to use net-log:

### startTracer()

This function registers observers needed to activate resource tracer.

### stopTracer()

This function unregisters tracer observers.

### registerBrowser(browser, [options])

Register a new browser element. All network requests associated with the provided `browser` will be handled by callbacks given in options.

`options` is an object with the following properties:

* `onRequest(request)`: function called when a request is initiated
* `onResponse(response)`: function called when a response is received. This function is called twice (start and end of response).
* `captureTypes`: list of regular expressions indicating which mime-types you want to capture. They will be available as `body` property in `response` object.

Other properties allow you to follow the loading of the main document in the given browser. You should set callback function to them:

* `onLoadStarted`: called when the load of a new document is asked in the (tab) browser
* `onURLChanged`: called when the URL is changed. The document is not loaded yet. The callback received the new URI
* `onTransferStarted`: called when the download of the content of the main document is started.
* `onContentLoaded`: called when the main content is loaded. Dependant resources are not loaded yet and the document is not parsed yet
* `onLoadFinished`: called when the document is ready. Received `"success"` or `"fail"` as parameter. All resources are loaded. The document has just received the load event.

Note: if you call `registerBrowser` twice with the same `browser` argument, it will override the last registration.

### unregisterBrowser(browser)

Remove the browser from tracer.

Request and Response objects
----------------------------

### request

This object is received by `onRequest` callback. It contains the following properties:

 * `id`: the number of the requested resource
 * `method`: http method
 * `url`: the URL of the requested resource
 * `time`: Date object containing the date of the request
 * `headers`: list of http headers

### response

This object is received by `onResponse` callback. It contains the following properties:

 * `id`: the number of the requested resource
 * `url`: the URL of the requested resource
 * `time`: Date object containing the date of the response
 * `headers`: list of http headers
 * `bodySize`: size of the received content (entire content or chunk content)
 * `contentType`: the content type if specified
 * `contentCharset`: the charset of the content if specified
 * `redirectURL`: if there is a redirection, the redirected URL
 * `stage`: "start" or "end"
 * `status`: http status code. ex: `200`
 * `statusText`: http status text. ex: `OK`
 * `referrer`: the resource referrer
 * `body`: body content if you asked for it

Note: `body` will allways be available for the first (main) response.

Example
-------

Here is a simple example on how to use it in your module:

```js
"use strict";

const tabBrowser = require("tab-browser");
const {getBrowserForTab} = require("sdk/tabs/utils");

const {registerBrowser, unregisterBrowser, startTracer} = require("net-log");

exports.main = function() {
    startTracer();

    tabBrowser.TabTracker({
        onTrack: function(tab) {
            let browser = getBrowserForTab(tab);
            registerBrowser(browser, {
                onRequest: function(request) {
                    console.log("--- REQUEST", request.id, request.method, request.url);
                },
                onResponse: function(response) {
                    console.log("+++ RESPONSE", response.id, response.status, response.url);
                },
                captureType: [/^text\/css$/] // Capture all CSS
            });
        },
        onUntrack: function(tab) {
            let browser = getBrowserForTab(tab);
            unregisterBrowser(browser);
        }
    });
}
```
