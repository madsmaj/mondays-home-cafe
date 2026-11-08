import {BrowserRouter,Routes,Route} from "react-router-dom";
import Home from "./pages/Home";
import {CustomerLogin,CustomerRegister,AdminLogin,RiderLogin} from "./pages/AuthPages";
import Menu from "./pages/Menu";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import CustomerDashboard from "./pages/CustomerDashboard";
import Receipt from "./pages/Receipt";
import Admin,{AdminHistory} from "./pages/Admin";
import Rider from "./pages/Rider";
import {Protected} from "./components/Layout";
function NotFound(){return <section className="section"><div className="empty-cart"><h1>Page Not Found</h1><p>The page you're looking for doesn't exist.</p></div></section>}
export default function App(){return <BrowserRouter><Routes><Route path="/" element={<Home/>}/><Route path="/customer/login" element={<CustomerLogin/>}/><Route path="/customer/register" element={<CustomerRegister/>}/><Route path="/customer/menu" element={<Menu/>}/><Route path="/customer/cart" element={<Cart/>}/><Route path="/customer/checkout" element={<Checkout/>}/><Route path="/customer/receipt" element={<Receipt/>}/><Route path="/customer/dashboard" element={<Protected role="customer"><CustomerDashboard/></Protected>}/><Route path="/admin/login" element={<AdminLogin/>}/><Route path="/admin" element={<Protected role="admin"><Admin/></Protected>}/><Route path="/admin/history" element={<Protected role="admin"><AdminHistory/></Protected>}/><Route path="/rider/login" element={<RiderLogin/>}/><Route path="/rider" element={<Protected role="rider"><Rider/></Protected>}/><Route path="*" element={<NotFound/>}/></Routes></BrowserRouter>}
