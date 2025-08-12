document.addEventListener("DOMContentLoaded", () => {
  const imageList = document.getElementById("image-list");
  const pastePrompt = document.getElementById("paste-prompt");
  const opacitySlider = document.getElementById("opacity-slider");
  const opacityValue = document.getElementById("opacity-value");
  const compareButton = document.getElementById("compare-button");
  const deleteButton = document.getElementById("delete-button");

  let state = {
    images: [],
    selectedIndex: -1,
    opacity: 0.5,
  };
  let isComparisonActive = false;

  function updateCompareButtonState(isActive) {
    isComparisonActive = isActive;
    if (isActive) {
      compareButton.textContent = "비교 종료";
      compareButton.classList.add("danger");
    } else {
      compareButton.textContent = "현재 화면과 비교";
      compareButton.classList.remove("danger");
    }
  }

  function renderImageList() {
    imageList.innerHTML = "";
    if (state.images.length === 0) {
      pastePrompt.style.display = "block";
      compareButton.disabled = true;
      deleteButton.style.display = "none";
      return;
    }
    pastePrompt.style.display = "none";
    compareButton.disabled = false;
    deleteButton.style.display = "block";

    state.images.forEach((imgSrc, index) => {
      const img = document.createElement("img");
      img.src = imgSrc;
      if (index === state.selectedIndex) {
        img.classList.add("selected");
      }
      img.addEventListener("click", () => {
        state.selectedIndex = index;
        chrome.storage.local.set({ selectedIndex: index });
        renderImageList();
        sendSettingUpdate("imageURL", state.images[state.selectedIndex]);
      });
      imageList.appendChild(img);
    });
  }

  function updateSettings(settings) {
    state.opacity = settings.opacity || 0.5;
    opacitySlider.value = state.opacity;
    opacityValue.textContent = state.opacity;
  }

  // 저장된 설정 불러오기
  chrome.storage.local.get(["images", "selectedIndex", "opacity"], (result) => {
    state.images = result.images || [];
    state.selectedIndex = result.selectedIndex ?? -1;
    // 유효하지 않은 selectedIndex는 -1로 초기화
    if (state.selectedIndex >= state.images.length) {
      state.selectedIndex = -1;
    }
    updateSettings(result);
    renderImageList();
  });

  // 팝업이 열릴 때, 현재 탭의 오버레이 상태를 확인합니다.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "get-status" },
        (response) => {
          if (!chrome.runtime.lastError && response?.status === "active") {
            updateCompareButtonState(true);
          } else {
            updateCompareButtonState(false);
          }
        }
      );
    }
  });

  function sendSettingUpdate(key, value) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "update-setting",
            key: key,
            value: value,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              // console.log("콘텐츠 스크립트가 없어 업데이트를 무시합니다.");
            }
          }
        );
      }
    });
  }

  opacitySlider.addEventListener("input", () => {
    const newOpacity = parseFloat(opacitySlider.value);
    opacityValue.textContent = newOpacity;
    chrome.storage.local.set({ opacity: newOpacity });
    sendSettingUpdate("opacity", newOpacity);
  });

  document.addEventListener("paste", (e) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = function (event) {
          const newImageURL = event.target.result;
          state.images.push(newImageURL);
          state.selectedIndex = state.images.length - 1;
          chrome.storage.local.set(
            { images: state.images, selectedIndex: state.selectedIndex },
            () => {
              renderImageList();
            }
          );
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        return;
      }
    }
  });

  deleteButton.addEventListener("click", () => {
    if (state.selectedIndex === -1) return;
    state.images.splice(state.selectedIndex, 1);
    state.selectedIndex = state.images.length > 0 ? 0 : -1;
    chrome.storage.local.set(
      { images: state.images, selectedIndex: state.selectedIndex },
      () => {
        renderImageList();
        // 오버레이도 업데이트 (이미지가 있으면 첫번째 이미지로, 없으면 닫기)
        const newImageURL = state.selectedIndex !== -1 ? state.images[0] : null;
        sendSettingUpdate("imageURL", newImageURL);
      }
    );
  });

  compareButton.addEventListener("click", () => {
    if (isComparisonActive) {
      // 오버레이가 활성화 상태이면 종료 메시지를 보냅니다.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "stop-comparison" },
            () => {
              updateCompareButtonState(false);
            }
          );
        }
      });
      return;
    }

    // 오버레이가 비활성화 상태이면 시작 로직을 실행합니다.
    if (state.selectedIndex === -1) {
      alert("먼저 이미지를 붙여넣어 주세요.");
      return;
    }
    const imageURL = state.images[state.selectedIndex];

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: ["content.js"],
        },
        () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(
              tabId,
              {
                action: "start-comparison",
                imageURL: imageURL,
                opacity: state.opacity,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "메시지 전송 실패:",
                    chrome.runtime.lastError.message
                  );
                  alert(
                    "콘텐츠 스크립트와 통신할 수 없습니다. 페이지를 새로고침하고 다시 시도해주세요."
                  );
                } else {
                  updateCompareButtonState(true);
                }
              }
            );
          }, 100);
        }
      );
    });
  });
});
