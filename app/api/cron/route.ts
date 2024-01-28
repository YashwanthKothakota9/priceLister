import Product from '@/lib/models/product.model';
import { connectToDB } from '@/lib/mongoose';
import { generateEmailBody, sendEmail } from '@/lib/nodemailer';
import { scrapeAmazonProduct } from '@/lib/scraper';
import {
  getAveragePrice,
  getEmailNotifType,
  getHighestPrice,
  getLowestPrice,
} from '@/lib/utils';
import { NextResponse } from 'next/server';

export const maxDuration = 5;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    connectToDB();

    const products = await Product.find({});
    if (!products) throw new Error('No Products found');

    //Scrape latest product & update db
    const updatedProducts = await Promise.all(
      products.map(async (currentProduct) => {
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);

        if (!scrapedProduct) throw new Error('No Product found');

        const updatePriceHistory: any = [
          ...currentProduct.priceHistory,
          { price: scrapedProduct.currentPrice },
        ];

        const product = {
          ...scrapedProduct,
          priceHistory: updatePriceHistory,
          lowestPrice: getLowestPrice(updatePriceHistory),
          highestPrice: getHighestPrice(updatePriceHistory),
          averagePrice: getAveragePrice(updatePriceHistory),
        };

        const updatedProduct = await Product.findOneAndUpdate(
          { url: product.url },
          product
        );

        //Check each product status and send email accordingly
        const emailNotifType = getEmailNotifType(
          scrapedProduct,
          currentProduct
        );

        if (emailNotifType && updatedProduct.users.length > 0) {
          const productInfo = {
            title: updatedProduct.title,
            url: updatedProduct.url,
          };

          const emailContent = await generateEmailBody(
            productInfo,
            emailNotifType
          );

          const userEmails = updatedProduct.users.map(
            (user: any) => user.email
          );

          await sendEmail(emailContent, userEmails);
        }

        return updatedProduct;
      })
    );

    return NextResponse.json({
      message: 'OK',
      data: updatedProducts,
    });
  } catch (error) {
    throw new Error(`Error in GET:${error}`);
  }
}
