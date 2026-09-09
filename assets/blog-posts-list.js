import PaginatedList from '@theme/paginated-list';

/**
 * A custom element that renders a paginated blog posts list
 */
export default class BlogPostsList extends PaginatedList {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', (event) => {
      console.log('click', event);
    });
  }
}

if (!customElements.get('blog-posts-list')) {
  customElements.define('blog-posts-list', BlogPostsList);
}
