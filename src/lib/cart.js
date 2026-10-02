import {useEffect, useState} from "react";

function read() { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } }
export function getCart() { return read(); }
export function saveCart(cart) { localStorage.setItem("cart", JSON.stringify(cart)); window.dispatchEvent(new Event("cartchange")); }
export function cartCount(cart=read()) { return cart.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity)||0),0); }
export function addToCart(product) {
  const cart=read(); const id=Number(product.product_id); const existing=cart.find(x=>Number(x.product_id)===id);
  if(existing) existing.quantity+=1; else cart.push({...product,product_id:id,price:Number(product.price)||0,quantity:1});
  saveCart(cart); return cart;
}
export function useCartCount() {
  const [count,setCount]=useState(()=>cartCount());
  useEffect(()=>{const update=()=>setCount(cartCount()); window.addEventListener("cartchange",update); window.addEventListener("storage",update); return()=>{window.removeEventListener("cartchange",update);window.removeEventListener("storage",update)}} ,[]);
  return count;
}
