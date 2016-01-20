'use strict';

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
const WPL = Ci.nsIWebProgressListener;

var WebProgressListener = {
    _isFromMainWindow: function(progress, request) {
        let notificationCallbacks =
                request.notificationCallbacks ? request.notificationCallbacks
                                              : request.loadGroup.notificationCallbacks;

        if (!notificationCallbacks) {
            return false;
        }

        try {
            if(notificationCallbacks.getInterface(Ci.nsIXMLHttpRequest)) {
                // ignore requests from XMLHttpRequest
                return false;
            }
        }
        catch(e) {}

        try {
            let loadContext = notificationCallbacks.getInterface(Ci.nsILoadContext);
            if (content == loadContext.associatedWindow) {
                return true;
            }
        }
        catch (e) {}

        return false;
    },

    onStateChange: function onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
        try {
            aRequest.QueryInterface(Ci.nsIHttpChannel);
        }
        catch(e) {
            return
        }
        if (!this._isFromMainWindow(aWebProgress, aRequest)) {
            return;
        }

        let isSuccess = Components.isSuccessCode(aRequest.status);

        if (this.isStart(aStateFlags)) {
            sendAsyncMessage("net-log:PageProgress", {progress:"loadstarted", url: aRequest.URI.spec});
        }
        else if (this.isTransferring(aStateFlags)) {
            let loaded = function() {
                content.document.removeEventListener('DOMContentLoaded', loaded, true);
                sendAsyncMessage("net-log:PageProgress", {progress:"contentloaded", success:true, url: aRequest.URI.spec});
            }.bind(this);
            content.document.addEventListener('DOMContentLoaded', loaded, true);
            sendAsyncMessage("net-log:PageProgress", {progress:"transferstarted", url: aRequest.URI.spec});
        }
        else if (this.isStopped(aStateFlags)) {
            if (!isSuccess) {
                // Send contentloaded with status false
                sendAsyncMessage("net-log:PageProgress", {progress:"contentloaded", success:false, url: aRequest.URI.spec});
            }
            sendAsyncMessage("net-log:PageProgress", {progress:"loadstopped", success:isSuccess, url: aRequest.URI.spec});
        }
        else if (this.isLoaded(aStateFlags)) {
            sendAsyncMessage("net-log:PageProgress", {progress:"loadfinished", success:isSuccess, url: aRequest.URI.spec});
        }
    },
  
    onProgressChange: function onProgressChange(aWebProgress, aRequest, aCurSelf, aMaxSelf, aCurTotal, aMaxTotal) {
    },
  
    onProgressChange64: function onProgressChange(aWebProgress, aRequest, aCurSelf, aMaxSelf, aCurTotal, aMaxTotal) {
        this.onProgressChange(aWebProgress, aRequest, aCurSelf, aMaxSelf, aCurTotal, aMaxTotal);
    },
  
    onLocationChange: function onLocationChange(aWebProgress, aRequest, aLocationURI, aFlags) {
        try {
            aRequest.QueryInterface(Ci.nsIHttpChannel);
        }
        catch(e) {
            return
        }
        if (!this._isFromMainWindow(aWebProgress, aRequest)) {
            return;
        }
        if (this.isURLError(aFlags)) {
            sendAsyncMessage("net-log:PageProgress", {progress:"urlerror", url: aLocationURI.spec});
        }
        else {
            sendAsyncMessage("net-log:PageProgress", {progress:"urlchanged", url: aLocationURI.spec});
        }
    },
  
    onStatusChange: function onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    },
  
    onSecurityChange: function onSecurityChange(aWebProgress, aRequest, aState) {
    },
  
    onRefreshAttempted: function onRefreshAttempted(aWebProgress, aURI, aDelay, aSameURI) {
        return true;
    },
  
    QueryInterface: function QueryInterface(aIID) {
        if (aIID.equals(Ci.nsIWebProgressListener) ||
            aIID.equals(Ci.nsIWebProgressListener2) ||
            aIID.equals(Ci.nsISupportsWeakReference) ||
            aIID.equals(Ci.nsISupports)) {
            return this;
        }
        throw Components.results.NS_ERROR_NO_INTERFACE;
    },

    // private methods
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
};

let webProgress = docShell.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIWebProgress);
webProgress.addProgressListener(WebProgressListener,
            Ci.nsIWebProgress.NOTIFY_STATE_ALL | Ci.nsIWebProgress.NOTIFY_LOCATION);

let isRegistered = true;

addEventListener('unload', function(event){
    if (isRegistered) {
        webProgress.removeProgressListener(WebProgressListener);
        isRegistered = false;
    }
}, false);

addMessageListener('net-log:deactivate', {
    receiveMessage: function(message) {
        if (isRegistered) {
            webProgress.removeProgressListener(WebProgressListener);
            isRegistered = false;
        }
    }
});

addMessageListener('net-log:reactivate', {
    receiveMessage: function(message) {
        if (!isRegistered) {
            webProgress.addProgressListener(WebProgressListener,
                Ci.nsIWebProgress.NOTIFY_STATE_ALL | Ci.nsIWebProgress.NOTIFY_LOCATION);
        }
    }
});
