// @ts-nocheck
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

'use strict';

/**
 * order controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    const { cart } = ctx.request.body;
    if (!cart) {
      ctx.response.status = 400;
      return { error: "Cart not found" };
    }

    try {
      const lineItems = await Promise.all(
        cart.map(async (product) => {
          const item = await strapi.query('api::product.product').findOne({ where: { documentId: product.documentId } });
          if (!item) {
            throw new Error(`Product with documentId ${product.documentId} not found`);
          }
          return {
            price_data: {
              currency: "SEK",
              product_data: {
                name: item.title,
                description: item.description || "No description available",
                images: [
                  'https://plus.unsplash.com/premium_photo-1663957861996-8093b48a22e6?q=80&w=1587&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',

                ],

              },
              unit_amount: item.price * 100,
            },
            quantity: product.amount,

          };

        })

      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${process.env.CLIENT_URL}?success=true`,
        cancel_url: `${process.env.CLIENT_URL}?success=false`,
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ["SE"] },
        payment_method_types: ["card", "paypal", "klarna"], // Ensure enabled in Stripe settings
        locale: "sv", // Set to Swedish
        allow_promotion_codes: true, // Allow promotion codes
      });
      // Save order details in Strapi
      await strapi.service('api::order.order').create({
        data: {
          products: cart,
          stripeId: session.id,

        },
      });

      return session; // Return session directly for easier handling on frontend
    } catch (error) {
      ctx.response.status = 500;
      return { error: error.message }; // Send error details to frontend
    }
  },
}));