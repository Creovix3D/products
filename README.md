# Creovix 3D product catalog

Start the site by double-clicking `start-server.bat`, or run this command in
the project folder:

```text
node server.js
```

Then open `http://localhost:3000`. Keep the server running while using the shop.
The shop checks the `IMG` folder every five seconds, so newly added images appear
as product cards without restarting the server.

Product images use compressed JPEG copies from `IMG/optimized` when available;
the original files remain unchanged. Each optimized copy is named after its
source file with `.jpg` appended (for example, `New Figurine.png.jpg`). New
images without an optimized copy still work, but use the original file and may
load more slowly.

Existing product details and new product overrides are stored in `catalog.json`.
`catalog-fallback.js` contains the saved product list for direct-file use and
serves as the server's fallback when `catalog.json` is absent. The Node server
is required to detect new photos in `IMG` automatically.
For each image, set its exact filename, display name, category, and price:

```json
{
  "image": "New Figurine.png",
  "name": "New Figurine",
  "category": "Figurines",
  "price": 799,
  "customizable": false,
  "approxSizeInches": "4 × 3 × 2"
}
```

Supported categories are `Figurines`, `Keychains`, and `Desk & more`. The
`customizable` property is optional. If an image is not yet listed in
`catalog.json`, the server still displays it using its filename, the `Desk &
more` category, and a “Contact for price” label. Its metadata can be added to
`catalog.json` at any time; the page will pick up the change on its next scan.

`approxSizeInches` is an optional `length × width × height` estimate in inches.
Sizes currently based on product photos are rough visual estimates, not measured
specifications; confirm exact dimensions before quoting a customer.

Customers can open `reviews.html` to rate a product and leave a review. Reviews
are saved by the server in `reviews.json`, shown on the review page, and
summarized beneath the matching product cards. Keep `node server.js` running to
browse, submit, and save reviews; opening the HTML files directly does not
enable review submissions.

## Cloudflare Pages deployment

This project includes a Cloudflare Pages Function at
`functions/api/reviews.js`. When deployed with Cloudflare Pages:

1. Connect the GitHub repository to a Cloudflare Pages project.
2. Use the repository root as the build output directory, and leave the build
   command empty.
3. Create a Cloudflare KV namespace and bind it to the Pages project with the
   variable name `REVIEWS`.
4. Deploy the project and confirm `/api/reviews` returns `[]`.

Reviews remain stored in Cloudflare KV rather than in `reviews.json`. The static
catalog fallback remains available when the Node `/api/products` endpoint is
not present on Cloudflare Pages.
