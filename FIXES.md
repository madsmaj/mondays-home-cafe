# Monday's Home Cafe — Rider Dashboard Fixes

## What was fixed

- Rider login no longer treats a missing `users/{uid}` profile as a customer.
- Rider and staff profiles are matched by the Firebase Authentication UID.
- Rider availability is explicitly:
  - Offline = not accepting new pickups
  - Available = online and ready to accept a pickup
  - Busy = currently handling a pickup
- A Busy rider cannot go Offline through the API.
- A rider with an assigned active pickup cannot go Offline.
- Accept Pickup is transactional, preventing two riders from claiming the same pickup.
- Release Pickup returns the order to the Ready/unassigned state and makes the rider Available.
- Starting delivery requires the order to belong to the logged-in rider.
- Marking Delivered returns the rider to Available.
- The rider dashboard finds the current rider by the Firebase UID, avoiding stale availability caused by confusing `rider_id` with the Firebase UID.
- Ready-order and assigned-order Firestore queries remain separate so they match the security rules.
- Rider dashboard status messages and buttons were rewritten to make Online/Offline behavior clear.
- Firestore rules now handle missing/null rider IDs safely.
- Firestore rules verify `changedBy` and `changedRole` for rider delivery updates.
- Service-worker cache version was bumped so old cached application assets are less likely to remain active.

## Validation

- All source `.js` and `.jsx` files were parsed successfully.
- The project source was audited for broad rider `orders.get()` queries; the only broad orders query is the admin-only `get-orders` operation.
- The uploaded `node_modules` directory was not included in the fixed archive because it contains platform-specific binaries. Run `npm install` before `npm run build`.

## Firebase staff setup

A rider must have:

1. A Firebase Authentication email/password account.
2. A Firestore document at `users/{Firebase Authentication UID}`.
3. `role: "rider"`.
4. A separate optional `rider_id` such as `RIDER-001`.

Do not use `RIDER-001` as the Firestore document ID unless it is also the Firebase Authentication UID.


## Customer login and Netlify deployment follow-up

- Added a brown **Back to Home** button to the customer login view. It routes to `/` using React Router and is not shown on admin/rider login.
- Bumped the service-worker cache to `mondays-cafe-v3` to refresh cached app assets after deployment.
- Google OAuth `auth/unauthorized-domain` is a Firebase Console configuration issue, not something frontend code can override. Add `mondays-home-cafe.netlify.app` under Firebase Console → Authentication → Settings → Authorized domains. Also ensure Google is enabled under Authentication → Sign-in method.
- After changing Firebase settings, redeploy and test Google login in a fresh/incognito window. Clear the site's old service worker/cache if the old page continues to appear.
- Never commit `.env`; recreate it locally from `.env.example` and add the same VITE variables to Netlify environment variables. The fixed archive intentionally excludes `.env`, `.git`, `node_modules`, and generated `dist`.
