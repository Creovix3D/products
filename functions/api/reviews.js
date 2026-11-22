const reviewsKey = "reviews:list:v1";
const allowedImageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function json(responseBody, status = 200) {
  return new Response(JSON.stringify(responseBody), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function textError(message, status) {
  return json({ error: message }, status);
}

function normalizeReview(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw Object.assign(new Error("Review submission must be an object."), { status: 400 });
  }

  const requiredTextFields = ["name", "productImage", "productName", "comment"];
  for (const field of requiredTextFields) {
    if (typeof review[field] !== "string" || !review[field].trim()) {
      throw Object.assign(new Error(`Review ${field} is required.`), { status: 400 });
    }
  }

  const normalized = {
    name: review.name.trim(),
    productImage: review.productImage.trim(),
    productName: review.productName.trim(),
    rating: review.rating,
    title: typeof review.title === "string" ? review.title.trim() : "",
    comment: review.comment.trim(),
    pros: typeof review.pros === "string" ? review.pros.trim() : "",
    cons: typeof review.cons === "string" ? review.cons.trim() : "",
  };

  if (
    normalized.name.length > 50 ||
    normalized.productName.length > 120 ||
    normalized.title.length > 80 ||
    normalized.comment.length < 20 ||
    normalized.comment.length > 1200 ||
    normalized.pros.length > 300 ||
    normalized.cons.length > 300
  ) {
    throw Object.assign(
      new Error("One or more review fields are outside the allowed length."),
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(normalized.rating) ||
    normalized.rating < 1 ||
    normalized.rating > 5
  ) {
    throw Object.assign(new Error("Choose a rating from 1 to 5 stars."), { status: 400 });
  }

  const extensionMatch = /\.([^.]+)$/.exec(normalized.productImage);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
  if (
    normalized.productImage.includes("/") ||
    normalized.productImage.includes("\\") ||
    !allowedImageExtensions.has(extension)
  ) {
    throw Object.assign(new Error("Choose a valid product."), { status: 400 });
  }
  return normalized;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.REVIEWS) {
    return textError("Review storage is not configured.", 500);
  }

  if (request.method === "GET") {
    const saved = await env.REVIEWS.get(reviewsKey);
    if (!saved) return json([]);

    try {
      const reviews = JSON.parse(saved);
      return json(Array.isArray(reviews) ? reviews : []);
    } catch {
      return textError("Stored review data is invalid.", 500);
    }
  }

  if (request.method === "POST") {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return textError("Send the review as JSON.", 415);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return textError("Review submission must be valid JSON.", 400);
    }

    let review;
    try {
      review = normalizeReview(body);
    } catch (error) {
      return textError(error.message, error.status || 400);
    }

    const saved = await env.REVIEWS.get(reviewsKey);
    let reviews = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) reviews = parsed;
      } catch {
        return textError("Stored review data is invalid.", 500);
      }
    }

    const savedReview = {
      id: crypto.randomUUID(),
      ...review,
      createdAt: new Date().toISOString(),
    };
    reviews.push(savedReview);
    await env.REVIEWS.put(reviewsKey, JSON.stringify(reviews));
    return json(savedReview, 201);
  }

  return new Response("Method not allowed.", {
    status: 405,
    headers: {
      Allow: "GET, POST",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
