import { sectionRenderer } from '@theme/section-renderer';
import PaginatedList from '@theme/paginated-list';

/**
 * A custom element that renders a paginated blog posts list
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement} [paginationPrevious] - The previous page button.
 * @property {HTMLButtonElement} [paginationNext] - The next page button.
 * @property {HTMLElement} [tagFilters] - The tag filters navigation element.
 *
 * @extends {PaginatedList}
 */
export default class CustomBlogPostsList extends PaginatedList {
  /** @type {AbortController | null} */
  #navigationAbortController = null;

  get replacesPageContent() {
    return true;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('popstate', this.#onPopState);
    this.#updatePaginationButtons();
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onPopState);
    this.#navigationAbortController?.abort();
    super.disconnectedCallback();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#updatePaginationButtons();
  }

  /**
   * @param {Event} event
   */
  onTagFilterClick = async (event) => {
    event.preventDefault();

    if (this.hasAttribute('data-loading')) return;

    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;

    try {
      await this.#applySectionFromUrl(new URL(target.href), { pushState: true });
    } catch (error) {
      this.#showNetworkError(error);
    }
  };

  /**
   * @param {Event} event
   */
  onPaginationPreviousClick = async (event) => {
    event.preventDefault();
    try {
      await this.loadPreviousPage();
      this.#updatePaginationButtons();
    } catch (error) {
      this.#showNetworkError(error);
    }
  };

  /**
   * @param {Event} event
   */
  onPaginationNextClick = async (event) => {
    event.preventDefault();
    try {
      await this.loadNextPage();
      this.#updatePaginationButtons();
    } catch (error) {
      this.#showNetworkError(error);
    }
  };

  #onPopState = () => {
    this.#applySectionFromUrl(new URL(window.location.href), { pushState: false }).catch(this.#showNetworkError);
  };

  /**
   * @param {unknown} error
   */
  #showNetworkError = (error) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof Error && error.name === 'AbortError') return;

    const message = error instanceof Error && error.message ? error.message : 'Network request failed';
    alert(message);
  };

  /**
   * @param {URL} url
   * @param {{ pushState?: boolean }} [options]
   */
  async #applySectionFromUrl(url, { pushState = false } = {}) {
    const requestUrl = new URL(url);
    requestUrl.searchParams.delete('page');
    requestUrl.hash = '';

    if (pushState) {
      history.pushState('', '', requestUrl.toString());
    }

    this.#navigationAbortController?.abort();
    this.#navigationAbortController = new AbortController();

    this.clearPageCache();

    const { grid } = this.refs;
    grid?.setAttribute('aria-busy', 'true');
    this.setAttribute('data-loading', '');

    try {
      await sectionRenderer.renderSection(this.sectionId, {
        url: requestUrl,
        cache: false,
      });
    } finally {
      grid?.removeAttribute('aria-busy');
      this.removeAttribute('data-loading');
    }

    this.#updatePaginationButtons();
    this.prefetchAdjacentPages();

    const tagFiltersElement = this.refs.tagFilters;
    if (tagFiltersElement instanceof HTMLElement) {
      tagFiltersElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  #updatePaginationButtons() {
    const { paginationPrevious, paginationNext, grid, cards } = this.refs;
    if (!grid) return;

    const lastPage = Number(grid.dataset.lastPage);
    const cardElements = Array.isArray(cards) ? cards : [];
    const firstPage = cardElements.length ? Number(cardElements[0]?.dataset.page) : 1;
    const lastCardPage = cardElements.length
      ? Number(cardElements[cardElements.length - 1]?.dataset.page)
      : 1;

    if (paginationPrevious instanceof HTMLButtonElement) {
      paginationPrevious.disabled = firstPage <= 1;
    }

    if (paginationNext instanceof HTMLButtonElement) {
      paginationNext.disabled = lastCardPage >= lastPage;
    }

    const paginationNav = this.querySelector('.blog-posts-pagination');
    if (paginationNav instanceof HTMLElement) {
      paginationNav.hidden = lastPage <= 1;
    }
  }
}

if (!customElements.get('custom-blog-posts-list')) {
  customElements.define('custom-blog-posts-list', CustomBlogPostsList);
}
