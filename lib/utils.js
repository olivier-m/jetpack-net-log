'use strict';

const {Cc, Ci} = require('chrome');

const imgTools = Cc['@mozilla.org/image/tools;1'].getService(Ci.imgITools);

const getWindowForRequest = function(request) {
    let loadContext = getRequestLoadContext(request);
    if (loadContext) {
        return loadContext.associatedWindow;
    }
    return null;
};
exports.getWindowForRequest = getWindowForRequest;


const getBrowserForRequest = function(request) {
    if (request instanceof Ci.nsIRequest) {
        try {
            request.QueryInterface(Ci.nsIHttpChannel);
            let window = getWindowForRequest(request);
            if (window) {
                let browser = window.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIWebNavigation)
                   .QueryInterface(Ci.nsIDocShell)
                   .chromeEventHandler;

                return browser;
            }
        }
        catch(e) {}
    }
    return null;
};
exports.getBrowserForRequest = getBrowserForRequest;


const getRequestLoadContext = function(request) {
    if (request && request.notificationCallbacks) {
        try {
            return request.notificationCallbacks.getInterface(Ci.nsILoadContext);
        }
        catch (ex) { }
    }

    if (request && request.loadGroup
        && request.loadGroup.notificationCallbacks) {
        try {
            return request.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
        }
        catch (ex) { }
    }

    return null;
};
exports.getRequestLoadContext = getRequestLoadContext;


const getImageInfo = function(data, contentType, url) {
    try {
        let bOS = Cc['@mozilla.org/binaryoutputstream;1']
                    .createInstance(Ci.nsIBinaryOutputStream);

        let storage = Cc['@mozilla.org/storagestream;1']
                    .createInstance(Ci.nsIStorageStream);

        storage.init(4096, data.length, null);

        bOS.setOutputStream(storage.getOutputStream(0));
        bOS.writeBytes(data, data.length);
        bOS.close();

        let input = storage.newInputStream(0);

        let bIS = Cc['@mozilla.org/network/buffered-input-stream;1']
                    .createInstance(Ci.nsIBufferedInputStream);
        bIS.init(input, 1024);

        let outParam = {value: null};
        imgTools.decodeImageData(bIS, contentType, outParam);

        return {
            width: outParam.value.width,
            height: outParam.value.height,
            animated: outParam.value.animated
        };
    } catch(e) {
        return {
            width: 0,
            height: 0,
            animated: false
        };
    }
};
exports.getImageInfo = getImageInfo;
