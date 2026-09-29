// ==UserScript==
// @name           Telegram Web - Media Batch Downloader
// @name:es        Telegram Web - Descarga Masiva de Grupos y Canales Restringidos
// @namespace      OsoCosmico
// @license        MIT
// @version        2.0.1-fix
// @description    Bypass restrictions. Async batch download optimized for videos, images and gifs.
// @description:es Salta restricciones. Descarga masiva asíncrona optimizada para videos, imágenes y GIFs.
// @author         OsoCosmico
// @match          https://web.telegram.org/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=telegram.org
// @grant          unsafeWindow
// @grant          GM_addStyle
// @grant          GM_download
// @downloadURL https://update.greasyfork.org/scripts/567432/Telegram%20Web%20-%20Media%20Batch%20Downloader.user.js
// @updateURL https://update.greasyfork.org/scripts/567432/Telegram%20Web%20-%20Media%20Batch%20Downloader.meta.js
// ==/UserScript==

// CHANGES:
// - Bypassed appDownloadManager.downloadToDisc() due to race condition
// - Implemented GM_download with blob URL fallback
// - Added anchor download fallback for blocked extensions (.mov, etc.)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadMediaFromMessage(msg) {

    /**
    * WORKAROUND: Telegram Web's async download pipeline races and drops custom filenames
    * 
    * Fix: Bypass appDownloadManager.downloadToDisc() entirely. Download via GM_download
    * with a locally-generated blob URL and filename. This avoids Telegram's internal
    * async pipeline where the filename was getting dropped.
    * 
    * Note: Requires @grant GM_download and handles 'not_whitelisted' errors for
    * blocked extensions (e.g., .mov) via anchor download fallback.
    */

    const appDownloadManager = unsafeWindow.appDownloadManager;
    const apiManagerProxy = unsafeWindow.apiManagerProxy;

    const myMedia = msg.media ? (msg.media.document || msg.media.photo) : null;

    if (myMedia) {
        try {
            // if (myMedia.fileName) {
            //     myMedia.fileName = myMedia.fileName.replace(/^(video|document)_/i, 'vid_').replace(/^photo_/i, 'img_');
            // } else {
            //     let isPhoto = msg.media.photo !== undefined;
            //     myMedia.fileName = (isPhoto ? 'img_' : 'vid_') + msg.id;
            // }

            const isPhoto = msg.media.photo !== undefined;
            const isVideo = msg.media.document?.type === 'video';

            const postId = msg.id;
            const mediaId = myMedia.id;

            const rawName = myMedia.file_name || null;
            // length check to avoid empty string names ""
            const namePart = rawName?.length ? myMedia.file_name : mediaId;

            // a user defined pattern parser could be implemented here {{var}}_{{var}}
            const fileName = [postId, namePart].filter(Boolean).join('_');

            myMedia.fileName = fileName;
            myMedia.file_name = fileName;

            // essential for images
            const thumb = isPhoto ? myMedia.sizes.slice().pop() : null;

            // console.log({ msg, myMedia });

            const options = {
                message: msg,
                media: myMedia,
                thumb,
            };

            let pingPromise = apiManagerProxy.pingServiceWorkerWithIframe();
            const result = await appDownloadManager.downloadMedia(options, 'disc', pingPromise);

            const isBlob = result instanceof Blob;
            // const isBlobUrl = typeof result === 'string' && result.startsWith('blob:');

            let url;

            try {
                if (isBlob) {
                    url = URL.createObjectURL(result);
                }

                await GM_download({
                    url,
                    name: fileName,
                    onload: () => {
                        // Clean up the URL allocation from browser memory
                        URL.revokeObjectURL(url);
                        console.log("Download finished!");
                    },
                    onerror: (errorDetails) => {
                        // Check if blocked by extension rules
                        if (errorDetails.error === 'not_whitelisted') {
                            // probably blocked file extension e.g. MOV
                            console.warn(`${fileName} GM_download blocked extension. Falling back to anchor download...`);

                            // Fallback to standard browser behavior
                            createDownloadAnchor(url, fileName);
                        } else {
                            URL.revokeObjectURL(url);
                            console.error("Download failed due to:", errorDetails.error);
                        }
                    }
                });
            } catch (error) {
                // to avoid blob URL leak on throw of apiManagerProxy.pingServiceWorkerWithIframe() or downloadMedia
                if (url) URL.revokeObjectURL(url);
                console.error("Download failed due to:", error);
                throw error;
            }

            // await appDownloadManager.downloadToDisc(options);

        } catch (error) {
            console.error('Error processing message:', error);
        }
    }
}

function createDownloadAnchor(url, fileName) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';

    a.style.position = 'absolute';
    a.style.top = '1px';
    a.style.left = '1px';

    document.body.append(a);

    try {
        a.click();
    } catch (e) {
        window.open(url, '_blank');
    }

    setTimeout(() => {
        a.remove();
    }, 100);
}

async function downloadSingleMedia(pid, mid) {
    var msg = await unsafeWindow.mtprotoMessagePort.getMessageByPeer(pid, mid);
    await downloadMediaFromMessage(msg);
}

async function downloadSelectedMedia() {
    var msgs = await unsafeWindow.appImManager.chat.selection.getSelectedMessages();
    var btnElm = document.querySelector('#batch-btn');
    var btnTxt = btnElm.querySelector('.i18n');
    var btnIco = btnElm.querySelector('.tgico');

    var targetMsgs = msgs.filter(msg => {
        return msg.media && (msg.media.photo || msg.media.document);
    });

    var total = targetMsgs.length;

    if (total === 0) {
        btnTxt.textContent = 'No Media';
        setTimeout(() => { btnTxt.textContent = 'Download'; }, 2000);
        return;
    }

    btnElm.disabled = true;
    btnElm.style.opacity = 0.7;

    for (let i = 0; i < total; i++) {
        let msg = targetMsgs[i];

        btnTxt.textContent = `${i + 1}/${total}`;
        btnIco.innerHTML = '&#xe95c;';

        await downloadMediaFromMessage(msg);

        if (i < total - 1) {
            await sleep(2000);
        }
    }

    btnElm.disabled = false;
    btnElm.style.opacity = 1;
    btnTxt.textContent = 'Download';
    btnIco.innerHTML = '&#xe97f;';

    // unsafeWindow.appImManager.chat.selection.clearSelection();
}

(function () {
    'use strict';

    if (window.location.pathname.startsWith('/a/')) {
        window.location.replace(window.location.href.replace('.org/a/', '.org/k/'));
    } else {
        var clArray = ['photo', 'audio', 'video', 'voice-message', 'media-round', 'grouped-item', 'document-container', 'sticker'];
        var btnHtml = '<div class="btn-menu-item rp-overflow" id="down-btn"><span class="tgico btn-menu-item-icon" style="font-size: 1.25rem; margin-right: 20px; margin-top: 1px;">&#xe97f;</span><span class="i18n btn-menu-item-text">Download</span></div>';
        var batchBtnHtml = '<button class="btn-primary btn-transparent text-bold" id="batch-btn" title="Download Selected Media" style="cursor:pointer; display:flex; align-items:center;"><span class="tgico" style="font-size: 1.25rem; margin-right: 10px; margin-top: 1px;">&#xe97f;</span><span class="i18n">Download</span></button>';
        var needBtn = false;
        var curMid, curPid, observer;

        GM_addStyle(`
            .no-forwards .bubbles, .bubble, .bubble-content {
                -webkit-user-select: text!important;
                -moz-user-select: text!important;
                user-select: text!important;
            }
        `);

        var origListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type) {
            if (type !== 'copy') {
                origListener.apply(this, arguments);
            }
        };

        document.addEventListener('mouseup', function (e) {
            if (e.button === 2) {
                needBtn = false;
                if (document.querySelector('.no-forwards')) {
                    var closest = e.target.closest('[data-mid]');
                    if (closest) {
                        if (clArray.some(function (clName) {
                            return closest.classList.contains(clName);
                        })) {
                            curMid = closest.dataset.mid;
                            curPid = closest.dataset.peerId;
                            needBtn = true;
                        }
                    }
                }
            }
        });

        observer = new MutationObserver(function (mutList) {
            mutList.forEach(function (mut) {

                if (mut.type === 'attributes' && mut.attributeName === 'class') {
                    if (mut.target.classList && mut.target.classList.contains('chat-input-main')) {
                        if (mut.target.classList.contains('is-selecting')) {
                            if (!document.querySelector('#custom-batch-wrapper')) {
                                let container = mut.target.querySelector('.chat-input-main-container');
                                if (container) {
                                    let btnWrapper = document.createElement('div');
                                    btnWrapper.id = "custom-batch-wrapper";
                                    btnWrapper.innerHTML = batchBtnHtml;

                                    btnWrapper.style.cssText = "position: absolute; right: 55px; top: -55px; z-index: 9999; background: var(--surface-color, #212121); border-radius: 24px; padding: 0px 0px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 0px solid var(--border-color, #333);";

                                    container.appendChild(btnWrapper);

                                    document.querySelector('#batch-btn').addEventListener('click', function () {
                                        downloadSelectedMedia();
                                    });
                                }
                            }
                        } else {
                            let btnWrapper = document.querySelector('#custom-batch-wrapper');
                            if (btnWrapper) btnWrapper.remove();
                        }
                    }
                }

                if (mut.type === 'childList') {
                    mut.addedNodes.forEach(function (anod) {
                        if (anod.nodeType !== 1) return;

                        if (anod.id === 'bubble-contextmenu' && needBtn) {
                            setTimeout(() => {
                                var menuItem = anod.querySelector('.btn-menu-item');
                                if (menuItem && !anod.querySelector('#down-btn')) {
                                    menuItem.insertAdjacentHTML('beforebegin', btnHtml);
                                    var downBtn = anod.querySelector('#down-btn');
                                    if (downBtn) {
                                        downBtn.addEventListener('click', function () {
                                            downloadSingleMedia(curPid, curMid);
                                        });
                                    }
                                }
                            }, 50);
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }
})();