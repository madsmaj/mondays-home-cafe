import {Link, useNavigate} from "react-router-dom";
import {useEffect} from "react";
import {auth} from "../lib/auth";
import {useCartCount} from "../lib/cart";

export function Navbar({ simple = false, showLogout = false }) {
  const count = useCartCount();
  const navigate = useNavigate();
  const user = auth.getUser();

  const logout = async () => {
    await auth.clear();
    navigate("/customer/login", { replace: true });
  };
  return <nav className="navbar"><div className="logo"><Link to="/"><img src="/images/logo.png" alt="Monday's Home Cafe" /></Link></div>{(!simple||showLogout)&&<div className="nav-icons">
    <Link aria-label="Home" to="/"><i className="fa-solid fa-house"/></Link>
    <Link aria-label="Menu" to="/customer/menu"><i className="fa-solid fa-mug-hot"/></Link>
    <Link aria-label="Shopping Cart" className="cart-icon" to="/customer/cart"><i className="fa-solid fa-bag-shopping"/><span id="cart-count">{count}</span></Link>
    {user?.role ? <button type="button" className="btn btn-secondary" onClick={logout}><i className="fa-solid fa-right-from-bracket"/> Logout</button> : <Link aria-label="Sign in" className="btn btn-secondary" to="/customer/login"><i className="fa-solid fa-right-to-bracket"/> Sign In</Link>}
  </div>}</nav>;
}
export function Footer(){return <footer className="footer"><div className="footer-brand"><h2>Monday's</h2><p>Pastries and Coffee</p><p className="tagline">Bringing sunshine and hope through our products and stories.</p></div><div className="footer-links"><div className="footer-col"><h4>Quick Links</h4><ul><li><Link to="/">Home</Link></li><li><Link to="/customer/menu">Menu</Link></li><li><Link to="/customer/cart">Cart</Link></li><li><Link to="/customer/dashboard">My Orders</Link></li><li><a href="https://maps.app.goo.gl/HoHFasrHQ6xc54vUA" target="_blank" rel="noopener noreferrer">Find Us</a></li></ul></div><div className="footer-col"><h4>Menu</h4><ul><li><Link to="/customer/menu#rice">Rice &amp; Sandwiches</Link></li><li><Link to="/customer/menu#specialty">Specialty Drinks</Link></li><li><Link to="/customer/menu#coffee">Coffee &amp; Drinks</Link></li></ul></div><div className="footer-col"><h4>Visit Us</h4><p><i className="fa-solid fa-location-dot"/> Roxas, Oriental Mindoro</p><p><i className="fa-regular fa-clock"/> Mon - Sat: 9 AM - 6 PM</p><p><i className="fa-solid fa-phone"/> 0917-555-0123</p></div></div></footer>}
export function Protected({role,children}) { const user=auth.getUserForRole(role); const navigate=useNavigate(); useEffect(()=>{if(!user || user.role!==role || !user.id){navigate(role==="customer"?"/customer/login":role==="admin"?"/admin/login":"/rider/login",{replace:true});}},[user?.id,user?.role,role,navigate]); return user?.role===role&&user?.id?children:<section className="section"><div className="empty-cart"><h2>Login required</h2><p>Redirecting to the correct portal…</p></div></section>; }
