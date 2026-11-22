let products = Array.isArray(window.Creovix_PRODUCTS)
  ? window.Creovix_PRODUCTS
  : [];
const form = document.querySelector("#review-form");
const productSelect = document.querySelector("#product-image");
const reviewFilter = document.querySelector("#review-filter");
const reviewList = document.querySelector("#review-list");
const statusMessage = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-review");
let reviews = [];

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function fillProductSelects() {
  productSelect.innerHTML = products
    .map(
      (product) =>
        `<option value="${escapeHTML(product.image)}">${escapeHTML(product.name)} · ${escapeHTML(product.category)}</option>`,
    )
    .join("");
  reviewFilter.innerHTML = [
    '<option value="all">All products</option>',
    ...products.map(
      (product) =>
        `<option value="${escapeHTML(product.image)}">${escapeHTML(product.name)}</option>`,
    ),
  ].join("");

  const requestedProduct = new URLSearchParams(location.search).get("product");
  if (products.some((product) => product.image === requestedProduct)) {
    productSelect.value = requestedProduct;
    reviewFilter.value = requestedProduct;
  }
}

async function loadProducts() {
  const response = await fetch("/api/products", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load products (HTTP ${response.status}).`);
  }
  const currentProducts = await response.json();
  if (
    !Array.isArray(currentProducts) ||
    currentProducts.some(
      (product) =>
        !product ||
        typeof product.image !== "string" ||
        typeof product.name !== "string" ||
        typeof product.category !== "string",
    )
  ) {
    throw new Error("The server returned invalid product data.");
  }
  products = currentProducts;
}

function renderSummary(visibleReviews) {
  const average =
    visibleReviews.length === 0
      ? 0
      : visibleReviews.reduce((total, review) => total + review.rating, 0) /
        visibleReviews.length;
  document.querySelector("#average-rating").textContent =
    visibleReviews.length === 0
      ? "—"
      : (Math.round(average * 10) / 10).toFixed(1);
  const roundedStars = Math.round(average);
  const stars = `${"★".repeat(roundedStars)}${"☆".repeat(5 - roundedStars)}`;
  document.querySelector("#average-stars").textContent = stars;
  document.querySelector("#average-stars").setAttribute(
    "aria-label",
    visibleReviews.length === 0
      ? "No ratings yet"
      : `${roundedStars} out of 5 stars`,
  );
  document.querySelector("#review-count").textContent =
    visibleReviews.length === 0
      ? "Be the first to share a review"
      : `${visibleReviews.length} ${
          visibleReviews.length === 1 ? "review" : "reviews"
        } ${
          reviewFilter.value === "all" ? "across the collection" : "for this product"
        }`;
}

function renderReviews() {
  const selectedProduct = reviewFilter.value;
  const visibleReviews = reviews.filter(
    (review) =>
      selectedProduct === "all" || review.productImage === selectedProduct,
  );
  renderSummary(visibleReviews);
  if (visibleReviews.length === 0) {
    reviewList.innerHTML =
      '<p class="empty-state">No reviews for this product yet. If you have tried it, your experience could help someone choose.</p>';
    return;
  }

  reviewList.innerHTML = visibleReviews
    .map((review) => {
      const product =
        products.find((candidate) => candidate.image === review.productImage) ||
        { name: review.productName };
      const date = new Date(review.createdAt);
      const formattedDate = Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
      const title = review.title || "A customer review";
      const ratingText = `${review.rating} out of 5 stars`;
      return `
        <article class="review-card">
          <div class="review-card-top">
            <div>
              <h3>${escapeHTML(title)}</h3>
              <p class="review-product">${escapeHTML(product.name)}</p>
            </div>
            <time class="review-date" datetime="${escapeHTML(review.createdAt)}">${escapeHTML(formattedDate)}</time>
          </div>
          <div class="review-stars" aria-label="${ratingText}">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>
          <p class="review-comment">${escapeHTML(review.comment)}</p>
          ${
            review.pros
              ? `<p class="review-detail"><strong>Loved:</strong> ${escapeHTML(review.pros)}</p>`
              : ""
          }
          ${
            review.cons
              ? `<p class="review-detail"><strong>Could be better:</strong> ${escapeHTML(review.cons)}</p>`
              : ""
          }
          <p class="review-byline">Shared by ${escapeHTML(review.name)}</p>
        </article>`;
    })
    .join("");
}

async function loadReviews() {
  const response = await fetch("/api/reviews", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load reviews (HTTP ${response.status}).`);
  }
  const savedReviews = await response.json();
  if (!Array.isArray(savedReviews)) {
    throw new Error("The server returned invalid review data.");
  }
  reviews = savedReviews
    .filter(
      (review) =>
        review &&
        Number.isInteger(review.rating) &&
        review.rating >= 1 &&
        review.rating <= 5 &&
        typeof review.productImage === "string" &&
        typeof review.comment === "string" &&
        typeof review.name === "string" &&
        typeof review.createdAt === "string",
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  renderReviews();
}

document.querySelectorAll('input[name="rating"]').forEach((input) => {
  input.addEventListener("change", () => {
    document.querySelectorAll(".rating-choice").forEach((choice, index) => {
      choice.classList.toggle("selected", index < Number(input.value));
    });
  });
});

productSelect.addEventListener("change", () => {
  reviewFilter.value = productSelect.value;
  renderReviews();
});
reviewFilter.addEventListener("change", renderReviews);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const product = products.find(
    (candidate) => candidate.image === productSelect.value,
  );
  if (!product) {
    statusMessage.textContent = "Choose a product before submitting your review.";
    statusMessage.className = "form-status error";
    return;
  }

  const values = Object.fromEntries(new FormData(form));
  const payload = {
    ...values,
    productName: product.name,
    rating: Number(values.rating),
  };
  submitButton.disabled = true;
  statusMessage.textContent = "Posting your review…";
  statusMessage.className = "form-status";
  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Your review could not be posted.");
    }
    reviews.unshift(result);
    form.reset();
    document.querySelectorAll(".rating-choice").forEach((choice) => {
      choice.classList.remove("selected");
    });
    productSelect.value = product.image;
    reviewFilter.value = product.image;
    renderReviews();
    statusMessage.textContent = "Thank you — your review has been posted.";
    statusMessage.className = "form-status success";
  } catch (error) {
    console.error("Unable to post product review.", error);
    statusMessage.textContent =
      error instanceof TypeError
        ? "Could not reach the shop server. Start it and try again."
        : error.message;
    statusMessage.className = "form-status error";
  } finally {
    submitButton.disabled = false;
  }
});

async function initializePage() {
  try {
    await loadProducts();
  } catch (error) {
    console.error("Unable to load current products.", error);
    statusMessage.textContent =
      "Newly added products could not be loaded. You can still review products in the saved catalogue.";
    statusMessage.className = "form-status error";
  }
  fillProductSelects();
  try {
    await loadReviews();
  } catch (error) {
    console.error("Unable to load product reviews.", error);
    reviewList.innerHTML =
      '<p class="empty-state">Reviews could not be loaded. Please check that the shop server is running, then try again.</p>';
    statusMessage.textContent =
      "Start the shop server to browse and submit reviews.";
    statusMessage.className = "form-status error";
  }
}

initializePage();
