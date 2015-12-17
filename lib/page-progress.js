'use strict';

const {Cc, Ci, Cr, components} = require('chrome');

const {Class, mix} = require('sdk/core/heritage');
const {emit} = require('sdk/event/core');
const {EventTarget} = require('sdk/event/target');
const events = require('sdk/system/events');
const unload = require('sdk/system/unload');


const WPL = Ci.nsIWebProgressListener;


let browserMap = new WeakMap();
let listenerList = [];

let frameScriptLoaded = false;

/**
 * This functions registers a new progress listener for given browser.
 * It returns listener instance.
 * @param {XULBrowser} browser
 *    The XUL Browser instance
 * @param {Object} options
 *    Logger instance options
 */
const registerBrowser = function(browser, options) {
    let listener = getListener(browser);
    if (listener !== null) {
        listener.start();
        return listener;
    }
    listener = PageProgress(browser, options);
    browserMap.set(browser, listener);
    listenerList.push(listener);
    listener.start();
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
    if (browser && browserMap.has(browser)) {
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
        if (!frameScriptLoaded) {
            let frameScriptUri = module.uri.replace('page-progress', 'frame-script');
            var globalMM = Cc["@mozilla.org/globalmessagemanager;1"]
              .getService(Ci.nsIMessageListenerManager);
            globalMM.loadFrameScript(frameScriptUri, true);
            frameScriptLoaded = true;
        }
    },

    start : function() {
        this.browser.messageManager.addMessageListener("net-log:PageProgress", this);
    },

    stop: function() {
        this.browser.messageManager.removeMessageListener("net-log:PageProgress", this);
    },

    receiveMessage : function(message) {
        switch (message.data.progress) {
            case 'urlchanged':
            case 'urlerror':
            case 'loadstarted':
                emit(this, message.data.progress, message.data.url);
                break;
            case 'contentloaded':
            case 'loadstopped':
            case 'loadfinished':
                emit(this, message.data.progress, message.data.success, message.data.url);
                break;
        }
    }
});

