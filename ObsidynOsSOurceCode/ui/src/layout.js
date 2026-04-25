// layout.js - Dynamic Layout Editing & Preset System
document.addEventListener("DOMContentLoaded", () => {
    let editMode = false;
    const layoutBtn = document.getElementById("layout-edit-btn");
    const appBody = document.querySelector(".app-body");
    const sidebar = document.querySelector(".sidebar");

    const presetSelect = document.getElementById("layout-preset-select");
    const loadLayoutBtn = document.getElementById("btn-load-layout");
    const presetNameInput = document.getElementById("layout-preset-name");
    const saveLayoutBtn = document.getElementById("btn-save-layout");
    const resetLayoutBtn = document.getElementById("btn-reset-layout");

    const resizableGrids = [
        ".dashboard-grid",
        ".operator-grid",
        ".settings-grid",
        ".settings-grid.ops-grid"
    ];

    let layoutsData = JSON.parse(localStorage.getItem("obsidyn-layouts")) || {
        current: "Default Layout",
        presets: {}
    };

    let uiState = JSON.parse(localStorage.getItem("obsidyn-ui-prefs")) || {
        compact: false,
        iconsOnly: false
    };

    initLayoutManager();
    applyUIPreferences();

    if (layoutBtn) {
        layoutBtn.addEventListener("click", () => {
            editMode = !editMode;
            document.body.classList.toggle("layout-edit-mode", editMode);
            layoutBtn.classList.toggle("active", editMode);

            const zoomWrapper = document.getElementById("zoom-controls-wrapper");
            if (zoomWrapper) {
                zoomWrapper.style.display = editMode ? "flex" : "none";
            }

            if (editMode) {
                enableEditMode();
                notify("Layout Edit Mode: ON. Drag to arrange or resize.", "info");
            } else {
                disableEditMode();
                saveCurrentLayoutState();
                notify("Layout Modifications Saved.", "success");
            }
        });
    }

    // Header Zoom Slider Logic
    const headerZoomSlider = document.getElementById("header-zoom-slider");
    const headerZoomPercentage = document.getElementById("header-zoom-percentage");
    if (headerZoomSlider && headerZoomPercentage) {
        const { webFrame } = require('electron');
        let currentZoom = 1.0;

        const zoomOutBtn = document.getElementById("header-zoom-out");
        const zoomInBtn = document.getElementById("header-zoom-in");
        const zoomResetBtn = document.getElementById("header-zoom-reset");

        function applyHeaderZoom(level) {
            currentZoom = Math.min(Math.max(level, 0.5), 2.0);
            webFrame.setZoomFactor(currentZoom);
            headerZoomSlider.value = currentZoom;
            headerZoomPercentage.textContent = Math.round(currentZoom * 100) + "%";
            localStorage.setItem("obsidyn-zoom", currentZoom);
        }

        const savedZoom = localStorage.getItem("obsidyn-zoom");
        if (savedZoom) applyHeaderZoom(parseFloat(savedZoom));

        headerZoomSlider.addEventListener("input", (e) => applyHeaderZoom(parseFloat(e.target.value)));
        if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => applyHeaderZoom(currentZoom - 0.1));
        if (zoomInBtn) zoomInBtn.addEventListener("click", () => applyHeaderZoom(currentZoom + 0.1));
        if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => applyHeaderZoom(1.0));
    }

    function initLayoutManager() {
        populatePresetDropdown();
        applySavedLayout(layoutsData.current === "Default Layout" ? null : layoutsData.presets[layoutsData.current]);

        if (saveLayoutBtn) saveLayoutBtn.addEventListener("click", handleSavePreset);
        if (loadLayoutBtn) loadLayoutBtn.addEventListener("click", handleLoadPreset);
        if (resetLayoutBtn) resetLayoutBtn.addEventListener("click", resetToDefault);

        const compactToggle = document.getElementById("settings-ui-compact");
        const iconsToggle = document.getElementById("settings-ui-icons-only");

        if (compactToggle) {
            compactToggle.checked = uiState.compact;
            compactToggle.addEventListener("change", (e) => {
                uiState.compact = e.target.checked;
                saveUIPreferences();
            });
        }
        if (iconsToggle) {
            iconsToggle.checked = uiState.iconsOnly;
            iconsToggle.addEventListener("change", (e) => {
                uiState.iconsOnly = e.target.checked;
                saveUIPreferences();
            });
        }
    }

    function populatePresetDropdown() {
        if (!presetSelect) return;
        presetSelect.innerHTML = '<option value="Default Layout">Default Layout</option>';
        Object.keys(layoutsData.presets).forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = `${name} (${layoutsData.presets[name].timestamp})`;
            if (name === layoutsData.current) opt.selected = true;
            presetSelect.appendChild(opt);
        });
    }

    function handleSavePreset() {
        if (!presetNameInput || !presetNameInput.value.trim()) {
            notify("Please enter a layout name.", "error");
            return;
        }
        const name = presetNameInput.value.trim();
        layoutsData.presets[name] = captureCurrentLayout(name);
        layoutsData.current = name;

        localStorage.setItem("obsidyn-layouts", JSON.stringify(layoutsData));
        presetNameInput.value = "";
        populatePresetDropdown();
        notify(`Layout '${name}' saved successfully.`, "success");
    }

    function handleLoadPreset() {
        if (!presetSelect) return;
        const name = presetSelect.value;
        layoutsData.current = name;
        localStorage.setItem("obsidyn-layouts", JSON.stringify(layoutsData));

        if (name === "Default Layout") {
            resetToDefault(false);
        } else {
            applySavedLayout(layoutsData.presets[name]);
            notify(`Loaded layout '${name}'.`, "success");
        }
    }

    function resetToDefault(showNotif = true) {
        layoutsData.current = "Default Layout";
        localStorage.setItem("obsidyn-layouts", JSON.stringify(layoutsData));
        if (sidebar) sidebar.style = "";

        resizableGrids.forEach(selector => {
            document.querySelectorAll(selector).forEach(grid => {
                grid.style.gridTemplateColumns = "";
                grid.dataset.resized = "";
            });
        });

        document.querySelectorAll(".info-card, .settings-card, .operator-card").forEach(card => {
            card.style.height = "";
            card.style.order = "";
        });

        if (showNotif) notify("Layout reset to default.", "info");
    }

    function captureCurrentLayout(name = "Current") {
        const layout = {
            name,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sidebar: sidebar ? sidebar.style.width : "",
            grids: {},
            cards: {}
        };

        resizableGrids.forEach(selector => {
            document.querySelectorAll(selector).forEach((grid, idx) => {
                if (grid.dataset.resized) {
                    layout.grids[`${selector}-${idx}`] = grid.style.gridTemplateColumns;
                }
            });
        });

        document.querySelectorAll(".info-card, .settings-card, .operator-card").forEach((card, idx) => {
            if (!card.dataset.cardId) card.dataset.cardId = "card-" + idx;
            if (card.style.order || card.style.height) {
                layout.cards[card.dataset.cardId] = { order: card.style.order, height: card.style.height };
            }
        });

        return layout;
    }

    function saveCurrentLayoutState() {
        if (layoutsData.current !== "Default Layout") {
            layoutsData.presets[layoutsData.current] = captureCurrentLayout(layoutsData.current);
            localStorage.setItem("obsidyn-layouts", JSON.stringify(layoutsData));
        } else {
            layoutsData.presets["Custom Auto"] = captureCurrentLayout("Custom Auto");
            layoutsData.current = "Custom Auto";
            localStorage.setItem("obsidyn-layouts", JSON.stringify(layoutsData));
            populatePresetDropdown();
        }
    }

    function applySavedLayout(layout) {
        if (!layout) return;
        if (layout.sidebar && sidebar) {
            sidebar.style.width = layout.sidebar;
            sidebar.style.minWidth = layout.sidebar;
            sidebar.style.maxWidth = layout.sidebar;
        }

        if (layout.grids || layout.cards) {
            setTimeout(() => {
                if (layout.grids) {
                    Object.keys(layout.grids).forEach(key => {
                        const lastDash = key.lastIndexOf("-");
                        const selector = key.substring(0, lastDash);
                        const idx = parseInt(key.substring(lastDash + 1));
                        const grids = document.querySelectorAll(selector);
                        if (grids[idx]) {
                            grids[idx].style.gridTemplateColumns = layout.grids[key];
                            grids[idx].dataset.resized = "true";
                        }
                    });
                }

                if (layout.cards) {
                    document.querySelectorAll(".info-card, .settings-card, .operator-card").forEach((card, idx) => {
                        if (!card.dataset.cardId) card.dataset.cardId = "card-" + idx;
                        if (layout.cards[card.dataset.cardId]) {
                            if (layout.cards[card.dataset.cardId].order) card.style.order = layout.cards[card.dataset.cardId].order;
                            if (layout.cards[card.dataset.cardId].height) card.style.height = layout.cards[card.dataset.cardId].height;
                        }
                    });
                }
            }, 100);
        }
    }

    function applyUIPreferences() {
        document.body.classList.toggle("ui-compact", uiState.compact);
        document.body.classList.toggle("ui-icons-only", uiState.iconsOnly);
    }

    function saveUIPreferences() {
        localStorage.setItem("obsidyn-ui-prefs", JSON.stringify(uiState));
        applyUIPreferences();
    }

    function notify(message, type = "info") {
        if (typeof window.showNotification === "function") {
            window.showNotification(message, type);
        }
    }

    function enableEditMode() {
        if (!document.getElementById("sidebar-resizer") && appBody && sidebar) {
            const resizer = document.createElement("div");
            resizer.id = "sidebar-resizer";
            resizer.className = "layout-resizer vertical-resizer";
            appBody.insertBefore(resizer, document.querySelector(".content-main"));
            makeFlexResizable(resizer, sidebar);
        }

        enableDragAndDrop();

        resizableGrids.forEach(selector => {
            document.querySelectorAll(selector).forEach((grid, gridIndex) => {
                grid.classList.add("resizable-grid");
                const compStyle = window.getComputedStyle(grid);
                let cols = compStyle.gridTemplateColumns.split(" ");
                if (cols.length > 1 && !grid.dataset.resized) {
                    grid.style.gridTemplateColumns = cols.join(" ");
                }

                Array.from(grid.children).forEach((child, idx, arr) => {
                    if (idx < arr.length - 1) {
                        if (window.getComputedStyle(child).position === "static") {
                            child.style.position = "relative";
                        }
                        const handle = document.createElement("div");
                        handle.className = "layout-resizer grid-resizer";
                        handle.dataset.index = idx;
                        child.appendChild(handle);
                        makeGridResizable(handle, grid, idx);
                    }
                });
            });
        });
    }

    function disableEditMode() {
        document.querySelectorAll(".layout-resizer").forEach(el => el.remove());
        document.querySelectorAll(".resizable-grid").forEach(el => el.classList.remove("resizable-grid"));
        disableDragAndDrop();
    }

    function makeFlexResizable(resizer, targetElement) {
        let isResizing = false;
        let startX, startWidth;

        resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = targetElement.getBoundingClientRect().width;
            document.body.style.cursor = "ew-resize";
            resizer.classList.add("active");
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            let newWidth = startWidth + (e.clientX - startX);
            if (newWidth < 180) newWidth = 180;
            targetElement.style.width = `${newWidth}px`;
            targetElement.style.minWidth = `${newWidth}px`;
            targetElement.style.maxWidth = `${newWidth}px`;
        });

        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
                resizer.classList.remove("active");
            }
        });

        resizer.addEventListener("dblclick", () => {
            targetElement.style.width = "";
            targetElement.style.minWidth = "";
            targetElement.style.maxWidth = "";
        });
    }

    function makeGridResizable(resizer, grid, colIndex) {
        let isResizing = false;
        let startX, startCols;

        resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            startX = e.clientX;
            startCols = window.getComputedStyle(grid).gridTemplateColumns.split(" ").map(parseFloat);
            document.body.style.cursor = "ew-resize";
            resizer.classList.add("active");
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const deltaX = e.clientX - startX;
            let cols = [...startCols];
            cols[colIndex] += deltaX;
            cols[colIndex + 1] -= deltaX;

            if (cols[colIndex] < 100 || cols[colIndex + 1] < 100) return;
            grid.style.gridTemplateColumns = cols.map(c => `${c}fr`).join(" ");
            grid.dataset.resized = "true";
        });

        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
                resizer.classList.remove("active");
            }
        });

        resizer.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            grid.style.gridTemplateColumns = "";
            grid.dataset.resized = "";
        });
    }

    let dragSrcEl = null;

    function enableDragAndDrop() {
        const cards = document.querySelectorAll(".info-card, .settings-card, .operator-card");
        cards.forEach((card, index) => {
            if (!card.dataset.cardId) card.dataset.cardId = "card-" + index;
            if (!card.style.order) card.style.order = index;

            card.draggable = true;
            card.style.cursor = "grab";

            card.addEventListener("dragstart", handleDragStart);
            card.addEventListener("dragover", handleDragOver);
            card.addEventListener("dragleave", handleDragLeave);
            card.addEventListener("drop", handleDrop);
            card.addEventListener("dragend", handleDragEnd);
        });
    }

    function disableDragAndDrop() {
        const cards = document.querySelectorAll(".info-card, .settings-card, .operator-card");
        cards.forEach(card => {
            card.draggable = false;
            card.style.cursor = "";
            card.removeEventListener("dragstart", handleDragStart);
            card.removeEventListener("dragover", handleDragOver);
            card.removeEventListener("dragleave", handleDragLeave);
            card.removeEventListener("drop", handleDrop);
            card.removeEventListener("dragend", handleDragEnd);
        });
    }

    function handleDragStart(e) {
        if (!editMode) return;
        this.style.opacity = "0.4";
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", this.dataset.cardId);
    }

    function handleDragOver(e) {
        if (!editMode) return;
        e.preventDefault();
        this.style.boxShadow = "inset 0 0 0 2px var(--accent-primary)";
        return false;
    }

    function handleDragLeave(e) {
        if (!editMode) return;
        this.style.boxShadow = "";
    }

    function handleDrop(e) {
        if (!editMode) return;
        e.stopPropagation();
        this.style.boxShadow = "";

        if (dragSrcEl !== this && dragSrcEl.parentNode === this.parentNode) {
            const srcOrder = dragSrcEl.style.order;
            const tgtOrder = this.style.order;
            dragSrcEl.style.order = tgtOrder;
            this.style.order = srcOrder;
            dragSrcEl.dataset.resized = "true";
            this.dataset.resized = "true";
        }
        return false;
    }

    function handleDragEnd(e) {
        if (!editMode) return;
        this.style.opacity = "1";
        document.querySelectorAll(".info-card, .settings-card, .operator-card").forEach(c => c.style.boxShadow = "");
    }
});
