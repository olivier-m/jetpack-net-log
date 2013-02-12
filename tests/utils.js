/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Some useful functions for testing purpose

"use strict";

const {Cc, Ci} = require("chrome");

const {startServerAsync} = require("sdk/test/httpd");
const {URL} = require("sdk/url");


const readBinaryURI = function(uri) {
    let ioservice = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    let channel = ioservice.newChannel(uri, "UTF-8", null);
    let stream = Cc["@mozilla.org/binaryinputstream;1"].
                  createInstance(Ci.nsIBinaryInputStream);
    stream.setInputStream(channel.open());

    let data = "";
    while (true) {
        let available = stream.available();
        if (available <= 0)
            break;
        data += stream.readBytes(available);
    }
    stream.close();

    return data;
};
exports.readBinaryURI = readBinaryURI;


const registerFile = function(srv, rootURI, path) {
    srv.registerPathHandler("/" + path, function(request, response) {
        try {
            let ext = path.split(".").pop()
            let contentType = "text/plain; charset=utf-8";
            if (ext in mimeTypes) {
                contentType = mimeTypes[ext];
            }

            let url = URL(path, rootURI);
            let data = readBinaryURI(url);

            response.setStatusLine(request.httpVersion, 200, "OK");
            response.setHeader("Content-Type", contentType, false);
            response.processAsync();
            response.write(data);
            response.finish();
        } catch(e) {
            console.error(e);
            console.exception(e);
        }
    });
};
exports.registerFile = registerFile;


const startServer = function(port, rootURI, fileList) {
    let srv = startServerAsync(port);

    fileList.forEach(function(val) {
        registerFile(srv, rootURI, val);
    });

    return srv;
};
exports.startServer = startServer;


const mimeTypes = {
    "css": "text/css; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "js": "application/javascript; charset=utf-8",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif"
};
