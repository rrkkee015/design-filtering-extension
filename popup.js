document.addEventListener("DOMContentLoaded", () => {
  const imageList = document.getElementById("image-list");
  const pastePrompt = document.getElementById("paste-prompt");
  const opacitySlider = document.getElementById("opacity-slider");
  const opacityValue = document.getElementById("opacity-value");
  const onOffToggle = document.getElementById("on-off-toggle");

  let state = {
    images: [],
    selectedIndex: -1,
    opacity: 0.5,
  };
  let isComparisonActive = false;

  function updateToggleButtonState(isActive) {
    isComparisonActive = isActive;
    onOffToggle.disabled = state.images.length === 0;

    if (isActive) {
      onOffToggle.textContent = "ON";
      onOffToggle.classList.add("active");
    } else {
      onOffToggle.textContent = "OFF";
      onOffToggle.classList.remove("active");
    }
  }

  function renderImageList() {
    imageList.innerHTML = "";
    if (state.images.length === 0) {
      pastePrompt.style.display = "block";
      imageList.style.display = "none";
      updateToggleButtonState(false);
      return;
    }
    pastePrompt.style.display = "none";
    imageList.style.display = "flex";
    updateToggleButtonState(isComparisonActive);

    state.images.forEach((imgSrc, index) => {
      const container = document.createElement("div");
      container.className = "thumbnail-container";

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

      const deleteBtn = document.createElement("div");
      deleteBtn.className = "delete-thumb-btn";
      deleteBtn.innerHTML = "&times;";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteImage(index);
      });

      container.appendChild(img);
      container.appendChild(deleteBtn);
      imageList.appendChild(container);
    });
  }

  function deleteImage(indexToDelete) {
    state.images.splice(indexToDelete, 1);
    if (state.selectedIndex === indexToDelete) {
      state.selectedIndex = state.images.length > 0 ? 0 : -1;
    } else if (state.selectedIndex > indexToDelete) {
      state.selectedIndex -= 1;
    }

    chrome.storage.local.set(
      { images: state.images, selectedIndex: state.selectedIndex },
      () => {
        renderImageList();
        const newImageURL =
          state.selectedIndex !== -1 ? state.images[state.selectedIndex] : null;
        sendSettingUpdate("imageURL", newImageURL);

        if (state.images.length === 0 && isComparisonActive) {
          // 마지막 이미지가 삭제되면 비교를 강제 종료
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "stop-comparison",
              });
            }
          });
        }
      }
    );
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
    if (state.selectedIndex >= state.images.length) {
      state.selectedIndex = -1;
    }
    updateSettings(result);

    // 팝업이 열릴 때, 현재 탭의 오버레이 상태를 확인합니다.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "get-status" },
          (response) => {
            const isActive =
              !chrome.runtime.lastError && response?.status === "active";
            updateToggleButtonState(isActive);
            renderImageList();
          }
        );
      } else {
        renderImageList();
      }
    });
  });

  function sendSettingUpdate(key, value) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "update-setting", key: key, value: value },
          (response) => {
            if (chrome.runtime.lastError) {
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
              // 붙여넣기 후 즉시 오버레이를 켭니다.
              turnOnOverlay();
            }
          );
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        return;
      }
    }
  });

  function turnOnOverlay() {
    if (state.selectedIndex === -1) {
      alert("비교할 이미지를 먼저 선택해주세요.");
      return;
    }
    const imageURL = state.images[state.selectedIndex];
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.scripting.executeScript(
        { target: { tabId: tabId }, files: ["content.js"] },
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
                  alert(
                    "콘텐츠 스크립트와 통신할 수 없습니다. 페이지를 새로고침하고 다시 시도해주세요."
                  );
                } else {
                  updateToggleButtonState(true);
                }
              }
            );
          }, 100);
        }
      );
    });
  }

  onOffToggle.addEventListener("click", () => {
    if (onOffToggle.disabled) return;

    if (isComparisonActive) {
      // Turn OFF
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "stop-comparison" },
            () => {
              updateToggleButtonState(false);
            }
          );
        }
      });
    } else {
      // Turn ON
      turnOnOverlay();
    }
  });
});
