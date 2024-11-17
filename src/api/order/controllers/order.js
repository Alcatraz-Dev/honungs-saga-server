// @ts-nocheck
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  timeout: 10000, // Set a 10-second timeout for Stripe API requests
});

'use strict';

/**
 * order controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    const { cart } = ctx.request.body;

    // Check if the cart exists
    if (!cart || !Array.isArray(cart)) {
      ctx.response.status = 400;
      return { error: "Cart is required and must be an array." };
    }

    try {
      // Map cart items to Stripe line items
      const lineItems = await Promise.all(
        cart.map(async (product) => {
          // Fetch product details from Strapi
          const item = await strapi.query('api::product.product').findOne({
            where: { documentId: product.documentId }
          });

          if (!item) {
            throw new Error(`Product with documentId ${product.documentId} not found`);
          }

          // Ensure the product price is valid
          if (!item.price || isNaN(item.price)) {
            throw new Error(`Invalid price for product ${item.title}`);
          }

          // Return the line item object for Stripe
          return {
            price_data: {
              currency: "SEK",
              product_data: {
                name: item.title,
                description: item.description || "No description available",
                images: item?.image?.url ? [item.image.url] : [], // Handle missing image URLs
              },
              unit_amount: Math.round(item.price * 100), // Convert to smallest currency unit
            },
            quantity: product.amount,
          };
        })
      );

      console.log("Line Items for Stripe:", JSON.stringify(lineItems, null, 2)); // Debug line items

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${process.env.CLIENT_URL}?success=true`,
        cancel_url: `${process.env.CLIENT_URL}?success=false`,
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ["SE"] },
        payment_method_types: ["card"], // Ensure these are enabled in Stripe
        locale: "sv", // Swedish locale
        allow_promotion_codes: true, // Allow promotion codes
      });

      console.log("Stripe session created successfully:", session);

      // Save the order details in Strapi
      await strapi.service('api::order.order').create({
        data: {
          products: cart,
          stripeId: session.id,
        },
      });

      // Return the Stripe session to the frontend
      return session;

    } catch (error) {
      console.error("Error during Stripe checkout session creation:", {
        message: error.message,
        stack: error.stack,
        response: error.response?.data, // Stripe error response
      });
      
      ctx.response.status = 500;

      // Provide a generic error message to the frontend while logging detailed info
      return { error: "An error occurred while processing your payment. Please try again later." };
    }
  },
}));