const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const imageDirectory = path.join(root, "IMG");
const optimizedImageDirectory = path.join(imageDirectory, "optimized");
const catalogPath = path.join(root, "catalog.json");
const reviewsPath = path.join(root, "reviews.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const supportedImageExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);
const allowedCategories = new Set(["Figurines", "Keychains", "Desk & more"]);
const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
let reviewWriteQueue = Promise.resolve();

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 10_000) {
      const error = new Error("Review submissions must be smaller than 10 KB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Review submission must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function validateReview(review) {
  const textFields = ["name", "productImage", "productName", "comment"];
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw Object.assign(new Error("Review submission must be an object."), {
      statusCode: 400,
    });
  }
  for (const field of textFields) {
    if (typeof review[field] !== "string" || !review[field].trim()) {
      throw Object.assign(new Error(`Review ${field} is required.`), {
        statusCode: 400,
      });
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
    throw Object.assign(new Error("One or more review fields are outside the allowed length."), {
      statusCode: 400,
    });
  }
  if (!Number.isInteger(normalized.rating) || normalized.rating < 1 || normalized.rating > 5) {
    throw Object.assign(new Error("Choose a rating from 1 to 5 stars."), {
      statusCode: 400,
    });
  }
  if (
    path.basename(normalized.productImage) !== normalized.productImage ||
    !supportedImageExtensions.has(
      path.extname(normalized.productImage).toLowerCase(),
    )
  ) {
    throw Object.assign(new Error("Choose a valid product."), {
      statusCode: 400,
    });
  }
  return normalized;
}

async function readReviews() {
  const reviews = JSON.parse(await fs.readFile(reviewsPath, "utf8"));
  if (!Array.isArray(reviews)) {
    throw new Error("reviews.json must contain an array.");
  }
  return reviews;
}

async function saveReview(review) {
  const operation = reviewWriteQueue.then(async () => {
    const imagePath = path.join(imageDirectory, review.productImage);
    const image = await fs.stat(imagePath).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!image || !image.isFile()) {
      throw Object.assign(new Error("That product is no longer available."), {
        statusCode: 400,
      });
    }

    const reviews = await readReviews();
    const savedReview = {
      id: crypto.randomUUID(),
      ...review,
      createdAt: new Date().toISOString(),
    };
    reviews.push(savedReview);
    await fs.writeFile(reviewsPath, `${JSON.stringify(reviews, null, 2)}\n`);
    return savedReview;
  });
  reviewWriteQueue = operation.catch((error) => {
    if (!error.statusCode) console.error("Unable to save product review:", error);
  });
  return operation;
}

function validateCatalog(catalog) {
  if (!Array.isArray(catalog)) {
    throw new Error("catalog.json must contain an array of product records.");
  }

  const images = new Set();
  for (const [index, product] of catalog.entries()) {
    const validImage =
      product &&
      typeof product.image === "string" &&
      path.basename(product.image) === product.image &&
      supportedImageExtensions.has(path.extname(product.image).toLowerCase());
    if (!validImage) {
      throw new Error(`catalog.json product ${index + 1} has an invalid image filename.`);
    }
    if (images.has(product.image)) {
      throw new Error(`catalog.json contains a duplicate image: ${product.image}`);
    }
    if (typeof product.name !== "string" || !product.name.trim()) {
      throw new Error(`catalog.json product "${product.image}" needs a name.`);
    }
    if (!allowedCategories.has(product.category)) {
      throw new Error(
        `catalog.json product "${product.image}" has an unsupported category.`,
      );
    }
    if (
      product.price !== null &&
      (typeof product.price !== "number" ||
        !Number.isFinite(product.price) ||
        product.price < 0)
    ) {
      throw new Error(
        `catalog.json product "${product.image}" needs a non-negative numeric price or null.`,
      );
    }
    if (product.customizable !== undefined && typeof product.customizable !== "boolean") {
      throw new Error(`catalog.json product "${product.image}" customizable must be true or false.`);
    }
    if (
      product.approxSizeInches !== undefined &&
      (typeof product.approxSizeInches !== "string" ||
        !/^\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?$/.test(
          product.approxSizeInches,
        ))
    ) {
      throw new Error(
        `catalog.json product "${product.image}" approxSizeInches must be three dimensions in inches.`,
      );
    }
    images.add(product.image);
  }
  return new Map(catalog.map((product) => [product.image, product]));
}

async function readCatalog() {
  try {
    return JSON.parse(await fs.readFile(catalogPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return require("./catalog-fallback.js");
  }
}

async function readOptimizedImages() {
  try {
    return await fs.readdir(optimizedImageDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function getProducts() {
  const [directoryEntries, catalog, optimizedEntries] = await Promise.all([
    fs.readdir(imageDirectory, { withFileTypes: true }),
    readCatalog(),
    readOptimizedImages(),
  ]);
  const productCatalog = validateCatalog(catalog);
  const imageNames = directoryEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        supportedImageExtensions.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const availableImages = new Set(imageNames);
  const missingCatalogImages = Array.from(productCatalog.keys()).filter(
    (image) => !availableImages.has(image),
  );
  if (missingCatalogImages.length > 0) {
    throw new Error(
      `catalog.json references image files missing from IMG: ${missingCatalogImages.join(", ")}`,
    );
  }

  const configuredImages = new Set(productCatalog.keys());
  const optimizedImages = new Set(
    optimizedEntries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );
  const configuredProducts = Array.from(productCatalog.values());
  const discoveredProducts = imageNames
    .filter((image) => !configuredImages.has(image))
    .map((image) => {
      const filename = path.parse(image).name;
      const name = filename.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      return {
        image,
        name: name || filename,
        category: "Desk & more",
        price: null,
        customizable: false,
        autoGenerated: true,
        approxSizeInches: "2 × 2 × 1",
      };
    });

  return [...configuredProducts, ...discoveredProducts].map((product) => {
    const optimizedFilename = `${product.image}.jpg`;
    if (!optimizedImages.has(optimizedFilename)) return product;
    return {
      ...product,
      optimizedImage: `/IMG/optimized/${encodeURIComponent(optimizedFilename)}`,
    };
  });
}

async function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    send(response, 400, "Invalid URL path.");
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    send(response, 403, "Forbidden.");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType =
      contentTypes.get(path.extname(filePath).toLowerCase()) ||
      "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control":
        contentType.startsWith("image/")
          ? decodedPath.startsWith("/IMG/optimized/")
            ? "public, max-age=604800"
            : "public, max-age=86400"
          : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      send(response, 404, "Not found.");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url, `http://${request.headers.host || host}`).pathname;
  } catch {
    send(response, 400, "Invalid request URL.");
    return;
  }

  try {
    if (pathname === "/api/reviews") {
      if (request.method === "GET") {
        sendJson(response, 200, await readReviews());
        return;
      }
      if (request.method === "POST") {
        try {
          const review = validateReview(await readJsonBody(request));
          sendJson(response, 201, await saveReview(review));
        } catch (error) {
          if (!error.statusCode) throw error;
          sendJson(response, error.statusCode, { error: error.message });
        }
        return;
      }
      response.setHeader("Allow", "GET, POST");
      send(response, 405, "Method not allowed.");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      send(response, 405, "Method not allowed.");
      return;
    }
    if (pathname === "/api/products") {
      const products = await getProducts();
      send(
        response,
        200,
        JSON.stringify(products),
        "application/json; charset=utf-8",
      );
      return;
    }
    await serveStatic(request, response, pathname);
  } catch (error) {
    console.error("Request failed:", error);
    if (!response.headersSent) {
      send(response, 500, "Unable to load products or website files.");
    } else {
      response.destroy(error);
    }
  }
});

server.listen(port, host, () => {
  console.log(`Creovix 3D is running at http://${host}:${port}`);
  console.log("Product images are scanned from IMG; edit catalog.json to set product details.");
});
