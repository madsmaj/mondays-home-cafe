# Monday's Home Cafe — Firebase Edition

This project uses React + Vite + Firebase Authentication + Cloud Firestore.

## Run locally

```bash
npm install
npm run dev
```

## Firebase setup

The project is already configured for the Firebase project used by Monday's Home Cafe.

Enable these Authentication providers in Firebase Console:

- Email/Password
- Google (customer login only, if desired)

Create Cloud Firestore using **Standard edition**. The Philippines region is not required; the project can use the selected `asia-southeast1 (Singapore)` location.

## IMPORTANT: Admin and rider accounts

Firebase Authentication and Firestore are separate.

For an admin or rider to log in, you must create the email/password account in:

**Firebase Console → Authentication → Users**

Then create a matching Firestore document in:

```text
users/{AUTH_UID}
```

The document ID must be the exact **Firebase Authentication UID**.

### Admin document

```json
{
  "name": "Monday's Admin",
  "email": "admin@example.com",
  "role": "admin"
}
```

### Rider document

```json
{
  "name": "Monday's Rider",
  "email": "rider@example.com",
  "role": "rider",
  "rider_id": "RIDER-001",
  "user_code": "RIDER-001",
  "availability": "Offline"
}
```

Do **not** use a random Firestore document ID for these staff profiles. Use the Authentication UID.

## Firestore rules

Deploy the included rules:

```bash
npm install -g firebase-tools
firebase login
firebase use monday-s-home-cafe-b5fc4
firebase deploy --only firestore:rules
```

The rider rules intentionally use two separate order queries: one for `Ready` orders and one for orders assigned to the logged-in rider. Firestore security rules are not query filters, so combining those conditions in one broad query can produce `Missing or insufficient permissions`.

## Rider workflow

Rider status has three clear states:

- **Offline** ⚫ — the rider is not accepting new pickups.
- **Available** 🟢 — the rider is online and can accept one Ready pickup.
- **Busy** 🔴 — the rider has an accepted pickup and must finish it or release it if it is still Ready.

The dashboard intentionally uses **Go Online** and **Go Offline** instead of ambiguous labels.

Workflow:

1. Rider logs in at `/rider/login`.
2. Rider profile must have `role: "rider"`.
3. Rider starts **Offline**.
4. Rider clicks **Go Online** → **Available**.
5. Admin changes an order to `Ready`.
6. The Ready order appears on the rider dashboard.
7. An Available rider clicks **Accept Pickup**.
8. The order receives `rider_id` and `rider_name`; rider becomes **Busy**.
9. While the order is `Ready`, the rider can either:
   - **Start Delivery** → order becomes `Delivery`, or
   - **Release Pickup** → order becomes unassigned and rider becomes **Available**.
10. Rider clicks **Start Delivery** → order becomes `Delivery`.
11. Rider clicks **Mark Delivered** → order becomes `Delivered` and rider becomes **Available**.
12. The customer can then confirm receipt → `Completed`.
13. A rider cannot go **Offline** while Busy or while an active pickup is still assigned.

The dashboard also refreshes automatically so new Ready pickups and rider status changes appear without manually reloading the page.

## Firestore query requirement

The rider dashboard uses separate Firestore queries because security rules are not filters:

```text
orders where status == "Ready"
orders where rider_id == current Firebase UID
```

Do not replace these with a broad `orders.get()` query for riders. A broad query can be rejected by Firestore security rules with `Missing or insufficient permissions`.

## Customer workflow

Customer registration creates a Firebase Authentication account and a matching `users/{uid}` profile with `role: "customer"`.

Customers can:

- Browse the menu
- Add products to the cart
- Check out
- Place orders
- View receipts
- Cancel Pending orders
- Confirm Delivered orders

## Admin workflow

Admin can:

- View all orders
- Accept/prepare Pending orders
- Reject Pending orders
- Mark Preparing orders Ready
- View rider assignment
- Mark supported online payments as Paid
- View order history

## Build

```bash
npm run build
```

For Firebase Hosting:

```bash
firebase deploy --only hosting
```

The included Hosting rewrite sends React Router paths such as `/customer/menu`, `/admin`, and `/rider` to `index.html`.
