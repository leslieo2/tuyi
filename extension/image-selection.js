(() => {
  const maxBytes = 8 * 1024 * 1024;
  const maxEdge = 4096;
  const selectionLifetime = 30_000;
  let selection;
  let expiry;

  function clearSelection() {
    clearTimeout(expiry);
    selection = undefined;
  }

  window.addEventListener("contextmenu", event => {
    if (!event.isTrusted) return;
    clearSelection();
    const image = event.composedPath().find(node => node instanceof HTMLImageElement);
    if (!image?.complete || !image.currentSrc || !image.naturalWidth || !image.naturalHeight) return;

    selection = {
      image: new WeakRef(image),
      source: image.currentSrc,
      page: location.href,
      expiresAt: Date.now() + selectionLifetime
    };
    expiry = setTimeout(clearSelection, selectionLifetime);
  }, { capture: true, passive: true });

  for (const type of ["pointerdown", "keydown"]) {
    window.addEventListener(type, event => {
      if (event.isTrusted) clearSelection();
    }, { capture: true, passive: true });
  }
  window.addEventListener("pagehide", clearSelection);

  function withoutFragment(url) {
    return typeof url === "string" ? url.split("#", 1)[0] : "";
  }

  function encodeBlob(blob, respond) {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") respond({ code: "image_read" });
      else respond({ base64: reader.result.slice(reader.result.indexOf(",") + 1) });
    };
    reader.readAsDataURL(blob);
  }

  function sendPixels(image, respond) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width > 12000 || height > 12000 || width * height > 40_000_000) {
      respond({ code: "image_dimensions" });
      return false;
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Reject a tainted canvas before exporting pixels.
      context.getImageData(0, 0, 1, 1);
    } catch {
      canvas.width = 0;
      respond({ code: "image_read" });
      return false;
    }

    const release = () => { canvas.width = 0; };
    try {
      canvas.toBlob(png => {
        if (png?.size && png.size <= maxBytes) {
          release();
          encodeBlob(png, respond);
          return;
        }
        // Large photos as PNG can exceed 8 MiB; fall back to JPEG before failing.
        canvas.toBlob(jpeg => {
          release();
          if (!jpeg?.size || jpeg.size > maxBytes) {
            respond({ code: jpeg?.size > maxBytes ? "image_size" : "image_read" });
            return;
          }
          encodeBlob(jpeg, respond);
        }, "image/jpeg", 0.92);
      }, "image/png");
      return true;
    } catch {
      release();
      respond({ code: "image_read" });
      return false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== "read-image-selection" ||
        sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("panel.html")) return;
    const selected = selection;
    clearSelection();
    const image = selected?.image.deref();
    if (!selected || !image?.isConnected || !image.complete ||
        Date.now() >= selected.expiresAt ||
        selected.source !== message.source ||
        image.currentSrc !== selected.source ||
        !image.naturalWidth || !image.naturalHeight ||
        withoutFragment(selected.page) !== withoutFragment(message.page) ||
        withoutFragment(selected.page) !== withoutFragment(location.href)) {
      respond({ code: "image_read" });
      return;
    }
    return sendPixels(image, respond);
  });
})();
