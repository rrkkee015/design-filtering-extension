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
        render(); // 불투명도 변경 시에만 즉시 렌더링
      } else if (request.key === "imageURL") {
        if (request.value) {
          // 이미지 변경 시에는, 이미지가 로드된 후 렌더링되므로 여기서 호출 불필요
          loadImage(request.value).then((img) => {
            designImage = img;
            updateDimensions();
          });
        } else {
          // 이미지가 없을 경우엔 정리만 하고 렌더링 안 함
          cleanup();
        }
      }
      sendResponse({ status: "Setting updated" });
    } else if (request.action === "get-status") {
      sendResponse({
        status: window.isDesignCompareScriptInjected ? "active" : "inactive",
      });
    } else if (request.action === "stop-comparison") {
      cleanup();
      sendResponse({ status: "stopped" });
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
    // 이미지가 아직 로드되지 않았을 수 있으므로 보호합니다.
    if (!designImage) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const defaultWidth = 360; // 디자인의 기본 논리적 너비로 가정

    // 휴리스틱: 이미지의 실제 너비와 기본 디자인 너비를 비교하여
    // 해당 이미지가 1x용인지 2x용인지(픽셀 밀도) 추측합니다.
    const imageDpr = Math.max(1, Math.round(designImage.width / defaultWidth));

    // 추측된 픽셀 밀도를 기반으로 이미지의 논리적 크기를 계산합니다.
    const imageLogicalWidth = designImage.width / imageDpr;
    const imageLogicalHeight = designImage.height / imageDpr;

    // 이 논리적 크기를 뷰포트에 맞추기 위한 스케일 비율을 계산합니다.
    const ratioX = viewportWidth / imageLogicalWidth;
    const ratioY = viewportHeight / imageLogicalHeight;
    const scale = Math.min(ratioX, ratioY);

    // 화면에 최종적으로 표시될 크기입니다.
    const displayWidth = imageLogicalWidth * scale;
    const displayHeight = imageLogicalHeight * scale;

    // 캔버스의 백업 저장소는 선명도를 위해 원본 이미지의 실제 픽셀 크기를 사용합니다.
    designCanvas.width = designImage.width;
    designCanvas.height = designImage.height;

    // CSS를 통해 화면에 표시될 크기를 설정합니다.
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
  }
})();
