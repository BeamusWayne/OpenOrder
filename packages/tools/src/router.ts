import { Ordering } from "@openorder/domain";
import {
  AddCartItemInputSchema,
  CheckoutInputSchema,
  GetMenuInputSchema,
  GetOrderInputSchema,
  PayOrderInputSchema,
  PrepareCheckoutInputSchema,
  SearchStoresInputSchema,
} from "@openorder/protocol";

export type ToolContext = {
  customerId: string;
  threadId: string;
  confirmed: boolean;
};

export function createToolRouter(ordering: Ordering, context: ToolContext) {
  return async function executeTool(name: string, raw: unknown): Promise<unknown> {
    switch (name) {
      case "search_stores":
        return ordering.searchStores(SearchStoresInputSchema.parse(raw));
      case "get_menu":
        return ordering.getMenu(
          GetMenuInputSchema.parse(raw).storeId,
          GetMenuInputSchema.parse(raw).itemQuery,
        );
      case "add_cart_item": {
        const input = AddCartItemInputSchema.parse(raw);
        return ordering.addCartItem({
          ...input,
          customerId: context.customerId,
          threadId: context.threadId,
        });
      }
      case "get_cart":
        return ordering.latestOpenCart(context.customerId);
      case "prepare_checkout":
        return ordering.prepareCheckout(
          PrepareCheckoutInputSchema.parse(raw).cartId,
          context.customerId,
        );
      case "checkout": {
        const input = CheckoutInputSchema.parse(raw);
        return ordering.checkout({
          customerId: context.customerId,
          cartId: input.cartId,
          idempotencyKey: input.idempotencyKey,
          confirmed: context.confirmed,
        });
      }
      case "pay_order":
        return ordering.pay(PayOrderInputSchema.parse(raw).orderId, context.customerId);
      case "get_order":
        return ordering.getOrder(GetOrderInputSchema.parse(raw).orderId, context.customerId);
      default:
        throw new Error(`Unknown tool ${name}`);
    }
  };
}
