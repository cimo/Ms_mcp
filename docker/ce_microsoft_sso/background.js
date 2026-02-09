// Copyright (c) 2017 Microsoft Corporation. All rights reserved.

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        try {
            // Pass the sender into the native host to validate that the page is able to call this method.
            request.sender = sender.origin;

            if ("GetSupportedUrls".localeCompare(request.method, undefined, { sensitivity: "base" }) == 0) {
                RespondWithError(CreateInvalidMethodResponse(), sendResponse);
                return true;
            }

            chrome.runtime.sendNativeMessage(
                "com.microsoft.browsercore",
                request,
                function (response) {
                    if (response != null) {
                        if (response.status == "Fail") {
                            RespondWithError(response, sendResponse);
                        }
                        else {
                            sendResponse({
                                status: "Success",
                                result: response
                            });
                        }
                    }
                    else {
                        RespondWithError({
                            status: "Fail",
                            code: "NoSupport",
                            description: chrome.runtime.lastError.message,
                        }, sendResponse);
                    }
                });
        }
        catch (e) {
            RespondWithError({
                status: "Fail",
                code: "NoSupport",
                description: e.toString(),
            }, sendResponse);
        }

        return true;
    });

chrome.action.onClicked.addListener(function (tab) {
    chrome.tabs.create({ url: 'https://www.office.com' });
});

function RespondWithError(response, sendResponse) {
    if (IsInvalidMethod(response)) {
        // for Invalid Method we want produce the same response regardless it came from extension or native code, it should be hidden from caller.
        sendResponse(CreateInvalidMethodResponse());
    }
    else {
        sendResponse(response);
    }
}

function IsInvalidMethod(response) {
    return response.ext && response.ext.error == -2147186943;
}

function CreateInvalidMethodResponse() {
    return {
        status: "Fail",
        code: "OSError",
        description: "Error processing request.",
        ext: { error: -2147186943 }
    };
}
