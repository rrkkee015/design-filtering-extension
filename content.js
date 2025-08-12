(() => {
  // 스크립트가 이미 실행 중인지 확인
  if (window.isDesignCompareScriptInjected) {
    return;
  }
  window.isDesignCompareScriptInjected = true;

  const PREFIX = "__design-compare-";
  let root, designCanvas, controls;
  let designImage;
  let opacity;
  let pos = { x: 0, y: 0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  // 메시지 리스너 설정
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start-comparison") {
      cleanup();
      opacity = request.opacity;
      loadImage(request.imageURL)
        .then((img) => {
          designImage = img;
          initUI();
          sendResponse({ status: "Comparison started" });
        })
        .catch((error) => {
          alert("디자인 이미지를 불러오는 데 실패했습니다.");
          console.error("Image load failed:", error);
          cleanup();
        });
    } else if (request.action === "update-setting") {
      if (request.key === "opacity") {
        opacity = request.value;
      } else if (request.key === "imageURL") {
        if (request.value) {
          loadImage(request.value).then((img) => {
            designImage = img;
            // 이미지가 바뀌면 크기도 다시 계산
            updateDimensions();
          });
        } else {
          // imageURL이 null이면 정리
          cleanup();
        }
      }
      render();
      sendResponse({ status: "Setting updated" });
    }
    return true; // 비동기 응답을 위해 true 반환
  });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function initUI() {
    const link = document.createElement("link");
    link.id = `${PREFIX}styles`;
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = chrome.runtime.getURL("content.css");
    document.head.appendChild(link);

    root = document.createElement("div");
    root.id = `${PREFIX}root`;
    document.body.appendChild(root);

    designCanvas = document.createElement("canvas");
    root.appendChild(designCanvas);

    createControls();
    attachEventListeners();
    updateDimensions();
    render();
  }

  function createControls() {
    controls = document.createElement("div");
    controls.id = `${PREFIX}controls`;

    const closeBtn = document.createElement("button");
    closeBtn.className = `${PREFIX}close-btn`;
    closeBtn.textContent = "닫기";
    closeBtn.onclick = cleanup;

    controls.appendChild(closeBtn);
    root.appendChild(controls);
  }

  function attachEventListeners() {
    designCanvas.addEventListener("mousedown", onDragStart);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
  }

  function updateDimensions() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    const defaultWidth = 360;
    const defaultHeight = 800;
    const ratioX = viewportWidth / defaultWidth;
    const ratioY = viewportHeight / defaultHeight;
    const scale = Math.min(ratioX, ratioY);

    const canvasBitmapWidth = designImage.width;
    const canvasBitmapHeight = designImage.height;

    const displayWidth = (canvasBitmapWidth / dpr) * scale;
    const displayHeight = (canvasBitmapHeight / dpr) * scale;

    designCanvas.width = canvasBitmapWidth;
    designCanvas.height = canvasBitmapHeight;
    designCanvas.style.width = `${displayWidth}px`;
    designCanvas.style.height = `${displayHeight}px`;

    render();
  }

  function render() {
    const dCtx = designCanvas.getContext("2d");
    designCanvas.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    dCtx.clearRect(0, 0, designCanvas.width, designCanvas.height);
    dCtx.globalAlpha = opacity;
    dCtx.drawImage(designImage, 0, 0, designCanvas.width, designCanvas.height);
  }

  function onDragStart(e) {
    isDragging = true;
    dragStart.x = e.clientX - pos.x;
    dragStart.y = e.clientY - pos.y;
    designCanvas.style.cursor = "grabbing";
  }

  function onDragMove(e) {
    if (!isDragging) return;
    pos.x = e.clientX - dragStart.x;
    pos.y = e.clientY - dragStart.y;
    render();
  }

  function onDragEnd() {
    isDragging = false;
    designCanvas.style.cursor = "move";
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
    }
  }

  function onResize() {
    updateDimensions();
  }

  function cleanup() {
    if (root) {
      root.remove();
      root = null;
    }
    const styleSheet = document.getElementById(`${PREFIX}styles`);
    if (styleSheet) {
      styleSheet.remove();
    }

    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);

    designImage = null;
    window.isDesignCompareScriptInjected = false;
  }
})();
