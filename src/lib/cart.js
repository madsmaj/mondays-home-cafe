import {useEffect, useState} from "react";

function read() { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } }
export function getCart() { return read(); }
export function saveCart(cart) { localStorage.setItem("cart", JSON.stringify(cart)); window.dispatchEvent(new Event("cartchange")); }
export function cartCount(cart=read()) { return cart.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity)||0),0); }
export function addToCart(product) {
  const cart = read();
  const id = Number(product.product_id);
  if (!Number.isFinite(id) || !product?.name) throw new Error("This product cannot be added to the cart.");

  const existing = cart.find(item => Number(item.product_id) === id);
  if (existing) {
    existing.quantity = Math.max(0, Number(existing.quantity) || 0) + 1;
    // Refresh product details in case the menu price or image changed.
    existing.name = product.name;
    existing.price = Math.max(0, Number(product.price) || 0);
    existing.image = product.image || existing.image || "/images/logo.png";
  } else {
    cart.push({
      ...product,
      product_id: id,
      name: String(product.name),
      price: Math.max(0, Number(product.price) || 0),
      image: product.image || "/images/logo.png",
      quantity: 1,
    });
  }
  saveCart(cart);
  return cart;
}
export function useCartCount() {
  const [count,setCount]=useState(()=>cartCount());
  useEffect(()=>{const update=()=>setCount(cartCount()); window.addEventListener("cartchange",update); window.addEventListener("storage",update); return()=>{window.removeEventListener("cartchange",update);window.removeEventListener("storage",update)}} ,[]);
  return count;
}
