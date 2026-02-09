// Copyright (c) 2017 Microsoft Corporation. All rights reserved.
// Because it is a content script it is performance critical. Do the minimum in global space.

window.addEventListener(
    "message",
    function (event) {
        const channelId = "53ee284d-920a-4b59-9d30-a60315b26836";
        if (
            event &&
            event.data &&
            event.data.channel &&
            event.data.channel == channelId
        ) {
            try {
                // Only accept messages from ourself.
                if (event.source != window) {
                    return;
                }

                var request = event.data;
                var method = request.body.method;
                const extensionId = chrome.runtime.id;
                const extensionVersion = chrome.runtime.getManifest().version;

                if (method === "CreateProviderAsync") {
                    // Legacy communication pattern
                    var extList = document.getElementById(`ch-${channelId}`);
                    if (extList) {
                        var extElement = document.createElement("div");
                        extElement.id = extensionId;

                        if (extensionVersion) {
                            extElement.setAttribute("ver", extensionVersion);
                        }

                        extList.appendChild(extElement);
                    }
                    return;
                } else if (OS == null) {
                    // Create helper functions. They're not loaded in global because they're not needed in every page (optimization). However, they're stored in global.
                    OS = {
                        Call: function (request, port) {
                            try {
                                const requestBody = { ...request.body };
                                // Set extra SKU param for direct server calls
                                if (requestBody.request) {
                                    const extraSkuParam = "x-client-xtra-sku";
                                    const extraParameters =
                                        requestBody.request.extraParameters ||
                                        {};
                                    if (!extraParameters[extraSkuParam]) {
                                        const skuGroupSeparator = ",";
                                        const skuValueSeparator = "|";
                                        const skuArr = Array.from(
                                            { length: 4 },
                                            () => skuValueSeparator
                                        );
                                        skuArr[2] = [
                                            "chrome",
                                            extensionVersion,
                                        ].join(skuValueSeparator);

                                        extraParameters[extraSkuParam] =
                                            skuArr.join(skuGroupSeparator);
                                        requestBody.request.extraParameters =
                                            extraParameters;
                                    }
                                }

                                chrome.runtime.sendMessage(
                                    requestBody,
                                    function (response) {
                                        if (response != null) {
                                            OS.Callback(
                                                request,
                                                response,
                                                port
                                            );
                                        } else {
                                            var errorPayload = {
                                                status: "Fail",
                                                code: "ContentError",
                                                description:
                                                    chrome.runtime.lastError
                                                        .message,
                                            };
                                            OS.Callback(
                                                request,
                                                errorPayload,
                                                port
                                            );
                                        }

                                        return true;
                                    }
                                );
                            } catch (e) {
                                var errorPayload = {
                                    status: "Fail",
                                    code: "ContentError",
                                    description: e.toString(),
                                };
                                OS.Callback(request, errorPayload, port);
                            }
                        },

                        Callback: function (request, response, port) {
                            var req = {
                                channel: channelId,
                                extensionId: chrome.runtime.id,
                                responseId: request.responseId,

                                body: {
                                    method: "Response",
                                    response: response,
                                },
                            };

                            if (!!port) {
                                port.postMessage(req);
                            } else {
                                window.postMessage(req, window.origin);
                            }
                        },
                    };
                }

                if (
                    method === "Handshake" &&
                    (!request.extensionId ||
                        request.extensionId === extensionId) &&
                    event.ports &&
                    event.ports.length
                ) {
                    // Stop event propagation to prevent caller and other extensions from reacting to this event
                    event.stopImmediatePropagation();
                    var req = {
                        channel: channelId,
                        extensionId: extensionId,
                        responseId: request.responseId,
                        body: {
                            method: "HandshakeResponse",
                            version: chrome.runtime.getManifest().version,
                        },
                    };

                    var port = event.ports[0];
                    port.onmessage = (event) => {
                        var request = event.data;
                        OS.Call(request, port);
                    };
                    port.postMessage(req);
                } else if (
                    request.extensionId === extensionId &&
                    method !== "Response"
                ) {
                    // Legacy communication pattern
                    OS.Call(request);
                }
            } catch (e) {
                console.log("CS: Exception in the channel: " + e.toString());
                // Swallow exception to not break page excecution.
            }
        }
    },
    true
); // "true" is important to give priority to the content script.

var OS = null;
