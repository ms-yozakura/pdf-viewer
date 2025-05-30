import * as pdfjsLib from "./pdfjs-5/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs-5/build/pdf.worker.mjs";

class PDFViewer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.shadowRoot.innerHTML = `
      <style>
      canvas {
        position: absolute;
        margin: 2.5% 0;
        border: 1px solid #ccc;
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
        transition: opacity 0.15s ease;
        opacity: 0;
      }

      .viewer {
        display: none;
        position: relative;
      }

      .viewer.display {
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100vw;
        height: 100vh;
      }

      .pdf-viewer-background {
        position: absolute;
        background-color: rgba(240, 248, 255, 0.45);
        width: 100vw;
        height: 100vh;
        top: 0;
        left: 0;
      }

      .pdf-controls {
        z-index: 1010;
        position: absolute;
        bottom: 3%;
        display: flex;
        align-items: center;
        gap: 10px;
        user-select: none;
      }

      .pdf-move-button {
        background-color: #ed8600;
        color: #fff;
        padding: 20px 10px;
        font-size: 14px;
        border-radius: 3px;
        cursor: pointer;
        user-select: none;
      }

      .pdf-move-button:active {
        background-color: #cf7000;
      }

      @media screen and (max-width: 480px){
        .table> thead> tr>th,
        .table> thead> tr>td,
        .table> tbody> tr>th,
        .table> tbody> tr>td{
          font-size: 16px;
          word-break: break-all;
        }
        {
          max-width:  240px;
        }
      }

      </style>
      <div class="container">
        <section class="viewer">
          <div class="pdf-viewer-background"></div>
          <div class="pdf-controls">
            <div class="pdf-prev pdf-move-button">前へ</div>
            <span class="pdf-page-info">- / -</span>
            <div class="pdf-next pdf-move-button">次へ</div>
          </div>
          <canvas id="pdf-canvas"></canvas>
        </section>
      </div>
    `;

    // 要素取得
    this.canvas = this.shadowRoot.querySelector("canvas");
    this.viewer = this.shadowRoot.querySelector(".viewer");
    this.viewerBG = this.shadowRoot.querySelector(".pdf-viewer-background");
    this.pageInfo = this.shadowRoot.querySelector(".pdf-page-info");
    this.prevBtn = this.shadowRoot.querySelector(".pdf-prev");
    this.nextBtn = this.shadowRoot.querySelector(".pdf-next");
    this.ctx = this.canvas.getContext("2d");

    // 初期状態
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.dpr = window.devicePixelRatio ? window.devicePixelRatio * 2 : 2;
    this.renderTask = null;

    // リサイズのdebounce用タイマーID
    this.resizeTimer = null;
  }

  connectedCallback() {
    this.viewerBG.addEventListener("click", () => {
      this.viewer.classList.remove("display");
    });

    this.prevBtn.addEventListener("click", () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.fadePage();
      }
    });

    this.nextBtn.addEventListener("click", () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.fadePage();
      }
    });

    window.addEventListener("resize", () => {
      if (this.pdfDoc) {
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          this.renderPage(this.currentPage);
        }, 150);
      }
    });


    // スワイプ用変数
  let touchStartX = 0;
  let touchStartY = 0;
  const minSwipeDistance = 50; // スワイプ判定の最小距離(px)
  const maxVerticalOffset = 30; // 縦方向の最大許容オフセット

  this.canvas.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  });

  this.canvas.addEventListener("touchend", (e) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // 横スワイプかつ縦の動きが少ない場合
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaY) < maxVerticalOffset) {
      if (deltaX < 0 && this.currentPage < this.totalPages) {
        // 左スワイプ：次ページ
        this.currentPage++;
        this.fadePage();
      } else if (deltaX > 0 && this.currentPage > 1) {
        // 右スワイプ：前ページ
        this.currentPage--;
        this.fadePage();
      }
    }
  });
  }

  // public method: PDFデータをセットし表示開始
  async loadPDF(url) {
    try {
      this.pdfDoc = await pdfjsLib.getDocument(url).promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = 1;
      this.viewer.classList.add("display");
      await this.renderPage(this.currentPage);
      this.canvas.style.opacity = 1;
    } catch (err) {
      console.error("PDFの読み込みに失敗しました:", err);
      alert("PDFの読み込みに失敗しました。");
    }
  }

  async displayPDF() {
    if (!this.pdfDoc) return;
    await this.renderPage(this.currentPage);
    this.canvas.style.opacity = 1;
  }

  async renderPage(pageNum) {
    if (!this.pdfDoc) return;

    try {
      const page = await this.pdfDoc.getPage(pageNum);

      if (this.renderTask) {
        this.renderTask.cancel();
      }

      const unscaled = page.getViewport({ scale: 1 });
      const scaleX = window.innerWidth / unscaled.width;
      const scaleY = window.innerHeight / unscaled.height;
      const scale = Math.min(scaleX, scaleY);

      const viewport = page.getViewport({ scale: scale * this.dpr });
      this.canvas.width = viewport.width;
      this.canvas.height = viewport.height;
      this.canvas.style.width = `${(0.9 * viewport.width) / this.dpr}px`;
      this.canvas.style.height = `${(0.9 * viewport.height) / this.dpr}px`;

      this.renderTask = page.render({
        canvasContext: this.ctx,
        viewport: viewport,
      });

      await this.renderTask.promise;
      this.pageInfo.textContent = `${pageNum} / ${this.totalPages}`;
      this.renderTask = null;
    } catch (err) {
      if (err?.name === "RenderingCancelledException") {
        return;
      }
      console.error("ページのレンダリングエラー:", err);
    }
  }

  fadePage() {
    this.canvas.style.opacity = 0;
    this.canvas.addEventListener(
      "transitionend",
      () => {
        this.renderPage(this.currentPage).then(() => {
          this.canvas.style.opacity = 1;
        });
      },
      { once: true }
    );
  }
}

class PDFBanner extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    const viewerId = this.getAttribute("data-viewer");
    const viewerElem = document.getElementById(viewerId);

    if (!viewerElem) {
      console.warn(`viewer要素が見つかりません: id=${viewerId}`);
      return;
    }

    const url = viewerElem.getAttribute("data-url");
    if (!url) {
      console.warn("data-url 属性が指定されていません");
      return;
    }

    this.addEventListener("click", async () => {
      // pdf-viewerカスタム要素のインスタンスとしてcast
      const pdfViewerInstance = viewerElem;

      // 表示クラス付与
      pdfViewerInstance.viewer.classList.add("display");

      if (!pdfViewerInstance.pdfDoc) {
        // PDFをロードして表示
        await pdfViewerInstance.loadPDF(url);
      } else {
        // すでに読み込み済みなら現在ページを再レンダリング
        await pdfViewerInstance.renderPage(pdfViewerInstance.currentPage);
        pdfViewerInstance.canvas.style.opacity = 1;
      }
    });
  }
}

customElements.define("pdf-viewer", PDFViewer);
customElements.define("pdf-banner", PDFBanner);
