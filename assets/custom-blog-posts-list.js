import PaginatedList from '@theme/paginated-list';

/**
 * A custom element that renders a paginated blog posts list
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement} [paginationPrevious] - The previous page button.
 * @property {HTMLButtonElement} [paginationNext] - The next page button.
 *
 * @extends {PaginatedList}
 */
export default class CustomBlogPostsList extends PaginatedList {
  get replacesPageContent() {
    return true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#updatePaginationButtons();
  }

  /**
   * @param {Event} event
   */
  onPaginationPreviousClick = async (event) => {
    event.preventDefault();
    await this.loadPreviousPage();
    this.#updatePaginationButtons();
  };

  /**
   * @param {Event} event
   */
  onPaginationNextClick = async (event) => {
    event.preventDefault();
    await this.loadNextPage();
    this.#updatePaginationButtons();
  };

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
  }
}

if (!customElements.get('custom-blog-posts-list')) {
  customElements.define('custom-blog-posts-list', CustomBlogPostsList);
}
