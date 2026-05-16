export {};

declare module "razorpay";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
    Razorpay?: any;
  }
}
