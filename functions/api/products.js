export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: {
        Allow: "GET",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  try {
    const catalogResponse = await env.ASSETS.fetch(
      new URL("/catalog.json", request.url),
    );
    if (!catalogResponse.ok) {
      return new Response("Unable to load the product catalog.", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const products = await catalogResponse.json();
    if (!Array.isArray(products)) {
      return new Response("The product catalog is invalid.", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(JSON.stringify(products), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load products:", error);
    return new Response("Unable to load the product catalog.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
