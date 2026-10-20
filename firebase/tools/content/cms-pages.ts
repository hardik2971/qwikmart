/**
 * Website / app CMS pages (Firestore pages/{slug}): about, terms, privacy, refund, delete-account.
 * HTML uses only the tags styled by `.prose-sb` (h2, h3, p, ul, ol, table, .note, .grid-3, .updated, .lead).
 * Values in {{…}} are filled from settings/public by update-cms-pages.ts.
 */

export const UPDATED = '20 October 2026';

const about = `
<p class="lead">{{app}} is a hyperlocal quick-commerce and online shopping platform. We bring groceries, fresh produce, daily essentials, beauty, pharmacy, electronics, fashion and home products from trusted local stores to your door — in minutes.</p>

<div class="grid-3">
  <div><strong>10–30 min</strong>Quick delivery from a store near you</div>
  <div><strong>12 categories</strong>From fresh produce to electronics</div>
  <div><strong>7 AM – 11 PM</strong>Ordering and support, every day</div>
</div>

<h2>Our story</h2>
<p>{{app}} started with a simple idea: shopping for everyday needs should not take a trip across town or a whole afternoon. We partner with neighbourhood stores and dark stores, list their live stock online and connect them with our own delivery partners, so the products you order are picked, packed and on their way within minutes.</p>

<h2>What you can do with {{app}}</h2>
<ul>
  <li><strong>Quick commerce</strong> — groceries, fruits &amp; vegetables, dairy, snacks, beverages, personal care and household essentials delivered in minutes from the nearest store in your zone.</li>
  <li><strong>eCommerce</strong> — a wider catalogue of electronics, mobiles, fashion, home &amp; kitchen and more, delivered in 1–4 days.</li>
  <li><strong>Self pickup</strong> — order online and collect from the store when it suits you.</li>
  <li><strong>Live tracking</strong> — follow your delivery partner on the map and share a one-time delivery code for a safe hand-over.</li>
  <li><strong>{{app}} Wallet</strong> — fast refunds, cashback and referral rewards in one place; pay in a single tap.</li>
  <li><strong>Secure payments</strong> — UPI, cards, net banking and wallets through Razorpay, plus Cash on Delivery.</li>
</ul>

<h2>Our promise</h2>
<ul>
  <li><strong>Fresh and genuine</strong> — products come from verified stores and brands; fresh produce is checked before packing.</li>
  <li><strong>Fair prices</strong> — the price you see at checkout, including taxes and fees, is the price you pay. No hidden charges.</li>
  <li><strong>Easy returns</strong> — if something is wrong, damaged or missing, tell us and we will make it right. See our <a href="/pages/refund">Return &amp; Refund Policy</a>.</li>
  <li><strong>Privacy first</strong> — we only use your data to run your orders and your account. Read our <a href="/pages/privacy">Privacy Policy</a>.</li>
</ul>

<h2>Grow with us</h2>
<h3>Sell on {{app}}</h3>
<p>Own a grocery, pharmacy or speciality store? List your products, receive orders from customers nearby and manage stock, orders and payouts from the {{app}} Store panel. Write to <a href="mailto:{{email}}">{{email}}</a> with the subject "Become a seller".</p>
<h3>Deliver with {{app}}</h3>
<p>Earn on your own schedule as a {{app}} delivery partner. Download the <strong>{{app}} Delivery</strong> app, register with your vehicle and documents, and start accepting orders once you are approved.</p>

<h2>Company information</h2>
<table>
  <tr><th>Legal name</th><td>{{company}}</td></tr>
  <tr><th>Registered office</th><td>{{address}}</td></tr>
  <tr><th>GSTIN</th><td>{{gstin}}</td></tr>
  <tr><th>Customer support</th><td><a href="mailto:{{email}}">{{email}}</a> · <a href="tel:{{phone_tel}}">{{phone}}</a></td></tr>
</table>
`;

const terms = `
<p class="updated">Last updated: ${UPDATED}</p>
<p>These Terms &amp; Conditions ("Terms") govern your use of the {{app}} website, the {{app}} mobile apps and all related services (together, the "Platform"), operated by <strong>{{company}}</strong>, {{address}} ("{{app}}", "we", "us"). By creating an account, browsing or placing an order you agree to these Terms. If you do not agree, please do not use the Platform.</p>

<h2>1. About the Platform</h2>
<p>{{app}} is an online marketplace. Products are sold by independent partner stores ("Sellers") listed on the Platform, and delivered by {{app}} delivery partners or collected by you at the store. {{app}} provides the technology, payment collection, customer support and delivery coordination. The Seller of each order is shown on the order details and the invoice.</p>

<h2>2. Eligibility and your account</h2>
<ul>
  <li>You must be at least 18 years old and able to enter into a binding contract under the Indian Contract Act, 1872.</li>
  <li>You can sign in with your mobile number (one-time password) or e-mail address. Keep your login details confidential; you are responsible for all activity on your account.</li>
  <li>Provide accurate name, phone and address details so we can deliver your orders. Tell us immediately at <a href="mailto:{{email}}">{{email}}</a> if you suspect unauthorised use.</li>
  <li>You may browse as a guest; an account is needed to place orders, use the wallet or write reviews.</li>
  <li>We may suspend or close accounts that break these Terms, misuse offers or referrals, or act fraudulently.</li>
</ul>

<h2>3. Products, prices and availability</h2>
<ul>
  <li>Product images are for illustration; packaging, colour and size may vary slightly. Product details, MRP, ingredients and expiry information come from the Seller and the brand.</li>
  <li>All prices are in Indian Rupees (₹) and include applicable taxes (GST) unless stated otherwise. Delivery fees, handling or small-cart fees and tips, where applicable, are shown before you pay.</li>
  <li>Stock is live but can change quickly. If an item becomes unavailable after you order, we will remove it from the order and refund the amount for that item.</li>
  <li>If a product is listed at a clearly wrong price because of a technical or typographical error, we may cancel the order and refund you in full.</li>
  <li>We may limit the quantity of an item per order to keep products available for everyone.</li>
</ul>

<h2>4. Orders</h2>
<ul>
  <li>Your order is an offer to buy. A contract is formed when the order is confirmed by the Seller (status <em>Received</em>).</li>
  <li><strong>Quick delivery</strong> orders are fulfilled by the nearest store in your delivery zone; delivery times shown (e.g. "Delivery in 15 minutes") are estimates and can change with traffic, weather and demand.</li>
  <li><strong>eCommerce</strong> orders are usually delivered in 1–4 days.</li>
  <li>For safety, some deliveries need a <strong>one-time delivery code</strong>, shown in your order, which you share with the delivery partner at hand-over.</li>
  <li>Please be available at the address at delivery time. If the delivery partner cannot reach you after reasonable attempts, the order may be cancelled; perishable items cannot be redelivered.</li>
  <li>Restricted products (for example medicines that need a prescription) may require extra verification and can be refused by the Seller.</li>
</ul>

<h2>5. Cancellation</h2>
<p>You can cancel an order from <strong>My Orders</strong> until it has been packed (statuses <em>Payment pending</em>, <em>Received</em> or <em>Processed</em>). Once it is packed or out for delivery it can no longer be cancelled; use a return instead where the product allows it. Some items are marked non-cancellable. We or the Seller may cancel an order if the item is out of stock, the address is not serviceable, payment fails or we suspect fraud. Refunds for cancellations are explained in the <a href="/pages/refund">Return &amp; Refund Policy</a>.</p>

<h2>6. Payments</h2>
<ul>
  <li>We accept UPI, debit and credit cards, net banking and wallets through our payment partner <strong>Razorpay</strong>, Cash on Delivery (up to ₹{{cod_max}} per order) and the {{app}} Wallet.</li>
  <li>Card and UPI details are entered on Razorpay's secure checkout. {{app}} does not see or store your full card number, CVV or UPI PIN.</li>
  <li>If money is deducted but the order is not confirmed, the payment is reversed automatically by the payment partner, or credited to you once we confirm it — usually within 5–7 working days.</li>
  <li>Please pay the exact amount for Cash on Delivery orders. Repeated refusal of COD orders may lead to COD being disabled for your account.</li>
</ul>

<h2>7. {{app}} Wallet</h2>
<ul>
  <li>The Wallet is a closed-loop store balance that can be used only on {{app}}. It holds refunds, cashback, referral rewards and money you add (₹{{wallet_min}} – ₹{{wallet_max}} per top-up).</li>
  <li>Wallet balance does not earn interest and cannot be transferred to another user. Promotional credits may have an expiry date or minimum order value, shown when they are given.</li>
  <li>Money you added yourself can be withdrawn to your bank account on request (minimum ₹{{withdraw_min}}), subject to verification. Promotional credits cannot be withdrawn.</li>
</ul>

<h2>8. Offers, coupons and referrals</h2>
<p>Coupons and offers have their own conditions (minimum order, validity, one use per user, eligible products) which are shown with the offer. Under the referral programme, when a friend signs up with your code and completes their first order of at least ₹{{ref_min}}, you receive ₹{{ref_referrer}} and your friend receives ₹{{ref_referred}} in the Wallet. We may change or end offers at any time, and may withdraw rewards obtained through fake accounts, self-referrals or other misuse.</p>

<h2>9. Reviews and content you post</h2>
<p>You may rate products and post reviews and photos. Your content must be honest, relate to your own experience and must not be unlawful, abusive, misleading or infringe anyone's rights. You give {{app}} a non-exclusive, royalty-free licence to display it on the Platform. We may remove content that breaks these rules.</p>

<h2>10. Acceptable use</h2>
<p>You agree not to: use the Platform for any unlawful purpose; resell products bought at promotional prices in commercial quantities; scrape, copy or reverse-engineer the Platform; interfere with its security; or harass our delivery partners, Sellers or support staff.</p>

<h2>11. Intellectual property</h2>
<p>The {{app}} name, logo, website and app design, software and content are owned by or licensed to {{company}}. Brand names and product images belong to their respective owners. You may not use them without written permission.</p>

<h2>12. Liability</h2>
<p>We work hard to keep the Platform accurate and available, but it is provided "as is". To the extent permitted by law, {{app}} is not liable for indirect or consequential losses, and our total liability for any order is limited to the amount you paid for that order. Nothing in these Terms limits your rights as a consumer under the Consumer Protection Act, 2019.</p>

<h2>13. Grievance redressal</h2>
<p>In line with the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology Rules, 2021, you can raise any complaint with our Grievance Officer:</p>
<table>
  <tr><th>Grievance Officer</th><td>Customer Experience Team, {{company}}</td></tr>
  <tr><th>Address</th><td>{{address}}</td></tr>
  <tr><th>E-mail</th><td><a href="mailto:{{email}}">{{email}}</a> (subject: "Grievance")</td></tr>
  <tr><th>Phone</th><td><a href="tel:{{phone_tel}}">{{phone}}</a> (7 AM – 11 PM, every day)</td></tr>
</table>
<p>We acknowledge complaints within 48 hours and aim to resolve them within one month.</p>

<h2>14. Governing law and changes</h2>
<p>These Terms are governed by the laws of India, and the courts of Mumbai, Maharashtra have jurisdiction, without affecting your right to approach a consumer commission. We may update these Terms from time to time; the date at the top shows the latest version, and continued use of the Platform means you accept the updated Terms.</p>
`;

const privacy = `
<p class="updated">Last updated: ${UPDATED}</p>
<p>This Privacy Policy explains how <strong>{{company}}</strong> ("{{app}}", "we", "us") collects, uses, shares and protects your personal data when you use the {{app}} website, the {{app}} customer app and the {{app}} Delivery partner app (together, the "Platform"). We process personal data in line with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.</p>

<div class="note"><strong>In short:</strong> we use your data to deliver your orders, run your account and keep the Platform safe. We do not sell your data and we do not show third-party advertising.</div>

<h2>1. Data we collect</h2>
<h3>Customers</h3>
<ul>
  <li><strong>Account details</strong> — name, mobile number, e-mail address, profile photo (optional) and a user ID.</li>
  <li><strong>Addresses and location</strong> — delivery addresses with a map pin, and your device's precise location when you allow it, to find the store and delivery zone near you. You can choose a city manually instead.</li>
  <li><strong>Orders and payments</strong> — items, prices, invoices, cancellations, returns, wallet transactions and the payment method used. Card, UPI and net-banking details are entered on <strong>Razorpay</strong>'s checkout and processed by Razorpay; we receive only a payment reference and status, never your full card number, CVV or UPI PIN.</li>
  <li><strong>Content you share</strong> — reviews, ratings and photos (reviews are public), return photos, support chat and contact-form messages.</li>
  <li><strong>Device data</strong> — a push-notification token, app version, device model and IP address, used to send order updates and to keep the service secure.</li>
</ul>
<h3>Delivery partners</h3>
<ul>
  <li>Name, phone, e-mail, address, date of birth, vehicle type and number, driving licence and ID proof, and bank account details for payouts.</li>
  <li><strong>Precise location while you are online</strong> — collected every few seconds, including when the app is in the background during an active shift, to offer nearby orders and to let the customer track the delivery. Location is not collected when you are offline.</li>
  <li>Earnings, cash collected, ratings and order history.</li>
</ul>
<h3>Website cookies</h3>
<p>The website uses essential cookies and local storage to keep you signed in, remember your cart, language and delivery zone. We do not use advertising or cross-site tracking cookies.</p>

<h2>2. How we use your data</h2>
<ul>
  <li>To create and manage your account and verify your login (OTP).</li>
  <li>To process, deliver, track and support your orders, payments, refunds and returns.</li>
  <li>To send order updates by push notification, SMS or e-mail, and — only if you have not opted out — offers from {{app}}.</li>
  <li>To answer your questions and complaints.</li>
  <li>To prevent fraud, misuse of offers and referrals, and to protect our users, Sellers and delivery partners.</li>
  <li>To improve our catalogue, search and service using aggregated, non-identifying statistics.</li>
  <li>To meet legal, tax and accounting obligations.</li>
</ul>

<h2>3. Who we share data with</h2>
<p>We share only what is needed for each purpose:</p>
<ul>
  <li><strong>Partner stores</strong> — your name, items and (for self pickup) contact number, to prepare your order.</li>
  <li><strong>Delivery partners</strong> — your name, phone number and delivery address for the order they deliver. Customers see the assigned delivery partner's name, phone and live location during delivery.</li>
  <li><strong>Service providers</strong> acting on our instructions: Google Firebase / Google Cloud (hosting, database, authentication, notifications), Razorpay (payments), SMS and e-mail providers, and map services.</li>
  <li><strong>Authorities</strong> — when required by law, court order or to protect rights and safety.</li>
</ul>
<p>We do not sell or rent your personal data.</p>

<h2>4. Where your data is stored and how it is protected</h2>
<p>Data is stored on Google Cloud / Firebase servers, which may be located in India or abroad, with encryption in transit (HTTPS/TLS) and at rest. Access is restricted by role: stores see only their own orders, and delivery partners see only the orders assigned to them. No system is perfectly secure; if a breach affects you, we will inform you and the authorities as required by law.</p>

<h2>5. How long we keep data</h2>
<table>
  <tr><th>Data</th><th>Retention</th></tr>
  <tr><td>Account and profile</td><td>While your account is active; removed or anonymised when you delete it</td></tr>
  <tr><td>Orders, invoices, payments, wallet transactions</td><td>8 years, as required by tax and accounting law</td></tr>
  <tr><td>Support chats and contact messages</td><td>Up to 2 years</td></tr>
  <tr><td>Delivery partner documents and bank details</td><td>While the partner account is active, and removed on deletion (payout records are kept for 8 years)</td></tr>
  <tr><td>Delivery partner location</td><td>Only the latest position is kept while online; the last position on a delivered order stays with that order record</td></tr>
</table>

<h2>6. Your rights and choices</h2>
<ul>
  <li><strong>Access and correction</strong> — view and edit your name, phone, e-mail, addresses and photo in your Profile.</li>
  <li><strong>Notifications</strong> — turn off push notifications in your device settings, or ask us to stop promotional messages.</li>
  <li><strong>Location</strong> — you can deny or withdraw location permission at any time in your device settings.</li>
  <li><strong>Deletion</strong> — delete your account in the app (Profile → Delete account) or follow the steps on our <a href="/pages/delete-account">Delete Account</a> page.</li>
  <li><strong>Withdraw consent / complain</strong> — contact our Grievance Officer below. You may also approach the Data Protection Board of India.</li>
</ul>

<h2>7. Children</h2>
<p>The Platform is meant for people aged 18 and over. We do not knowingly collect data from children. If you believe a child has given us personal data, contact us and we will delete it.</p>

<h2>8. Changes to this policy</h2>
<p>We may update this policy as the Platform changes. The date at the top shows the latest version; important changes will be announced in the app or by e-mail.</p>

<h2>9. Contact and Grievance Officer</h2>
<table>
  <tr><th>Grievance Officer</th><td>Data Protection &amp; Customer Experience Team, {{company}}</td></tr>
  <tr><th>Address</th><td>{{address}}</td></tr>
  <tr><th>E-mail</th><td><a href="mailto:{{email}}">{{email}}</a> (subject: "Privacy")</td></tr>
  <tr><th>Phone</th><td><a href="tel:{{phone_tel}}">{{phone}}</a></td></tr>
</table>
`;

const refund = `
<p class="updated">Last updated: ${UPDATED}</p>
<p>We want you to be happy with every order. This policy explains when you can cancel, return or replace items and how refunds are paid. It is part of our <a href="/pages/terms">Terms &amp; Conditions</a>.</p>

<h2>1. Cancelling an order</h2>
<ul>
  <li>Open <strong>My Orders</strong> → select the order → <strong>Cancel order</strong>. You can cancel until the order is packed (statuses <em>Payment pending</em>, <em>Received</em> or <em>Processed</em>).</li>
  <li>Once the order is packed, out for delivery or delivered it cannot be cancelled. Use a return instead if the item is eligible.</li>
  <li>Some items (for example made-to-order or special-price items) are marked <em>non-cancellable</em> on the product page.</li>
  <li>If we or the store cancel your order (item out of stock, address not serviceable, payment issue), you get a full refund.</li>
</ul>

<h2>2. Returns and replacements</h2>
<p>You can request a return from <strong>My Orders</strong> → the delivered order → <strong>Return</strong>, choosing the item, the quantity and the reason, and adding photos. The return window is shown on each product page ("Returnable within X days"); items without a return window cannot be returned except as described below.</p>
<div class="table-wrap"><table>
  <tr><th>Category</th><th>Return window</th><th>Conditions</th></tr>
  <tr><td>Fresh fruits &amp; vegetables, dairy, bakery, meat</td><td>Report at delivery or within 24 hours</td><td>Damaged, spoiled, wrong or missing items only — please share a photo</td></tr>
  <tr><td>Grocery, snacks, beverages, household</td><td>As shown on the product (usually 2–7 days)</td><td>Unopened, with original packaging and seal</td></tr>
  <tr><td>Beauty, personal care, pharmacy</td><td>As shown on the product</td><td>Sealed and unused; opened items only if damaged or wrong</td></tr>
  <tr><td>Electronics, mobiles</td><td>As shown on the product (usually 7 days)</td><td>Damaged, defective or not as described; with box, accessories, invoice and unchanged IMEI / serial number</td></tr>
  <tr><td>Fashion, home &amp; kitchen</td><td>As shown on the product (usually 7 days)</td><td>Unused, unwashed, with original tags and packaging</td></tr>
</table></div>
<p><strong>Not returnable</strong> (unless damaged, defective, expired or wrong): innerwear, opened personal-care and hygiene products, medicines and health devices once opened, gift cards and items marked "Non-returnable".</p>
<p><strong>Always covered:</strong> if an item is delivered damaged, expired, wrong or missing, contact us within 48 hours of delivery and we will replace it or refund it, whatever the product's return window.</p>

<h2>3. How a return works</h2>
<ol>
  <li>You submit the return request with photos.</li>
  <li>Our team reviews it, usually within 24 hours, and approves or rejects it (you will see the reason).</li>
  <li>For approved returns, a delivery partner collects the item from your address. For low-value perishables we may refund without pickup.</li>
  <li>After the item is picked up and checked, the refund is issued.</li>
</ol>

<h2>4. Refunds</h2>
<div class="table-wrap"><table>
  <tr><th>Situation</th><th>Refund to</th><th>Time</th></tr>
  <tr><td>Cancelled order (paid online or with Wallet)</td><td>{{app}} Wallet</td><td>Instant, once cancelled</td></tr>
  <tr><td>Approved return</td><td>{{app}} Wallet (default)</td><td>Instant, after pickup and quality check</td></tr>
  <tr><td>Approved return — refund to original method on request</td><td>UPI / card / bank account used (via Razorpay)</td><td>5–7 working days after approval (bank timelines apply)</td></tr>
  <tr><td>Cash on Delivery orders</td><td>{{app}} Wallet, or your bank account on request</td><td>Wallet instant; bank 5–7 working days</td></tr>
  <tr><td>Money deducted but order not placed</td><td>Original payment method (automatic reversal)</td><td>5–7 working days</td></tr>
</table></div>
<p>Refunds include the item price and taxes. Delivery and handling fees are refunded when the whole order is cancelled by us or when the return is due to our error (damaged, wrong, missing or expired item). Coupon discounts are adjusted proportionally. Wallet money can be used on your next order or, for money you added yourself, withdrawn to your bank account from the Wallet screen.</p>

<h2>5. Need help?</h2>
<p>Use <strong>Help &amp; Support</strong> in the app or the website, or contact us at <a href="mailto:{{email}}">{{email}}</a> / <a href="tel:{{phone_tel}}">{{phone}}</a> (7 AM – 11 PM, every day). Please keep your order number handy.</p>
`;

const deleteAccount = `
<p class="updated">Last updated: ${UPDATED}</p>
<p class="lead">You can delete your {{app}} account at any time. This page explains how to do it, what is deleted and what we must keep. It applies to the {{app}} customer app, the {{app}} website and the {{app}} Delivery partner app.</p>

<h2>Option 1 — Delete in the app (instant)</h2>
<h3>{{app}} customer app</h3>
<ol>
  <li>Open the {{app}} app and sign in.</li>
  <li>Go to <strong>Profile</strong> → <strong>Delete account</strong>.</li>
  <li>Read the information and confirm. You are signed out and the account is deleted immediately.</li>
</ol>
<h3>{{app}} Delivery partner app</h3>
<ol>
  <li>Open {{app}} Delivery and sign in.</li>
  <li>Go to <strong>Profile</strong> → <strong>Delete account</strong> and confirm.</li>
  <li>The account can be deleted only when you have no active orders and no unsettled cash in hand. Settle cash with your hub first.</li>
</ol>

<h2>Option 2 — Request by e-mail (without the app)</h2>
<p>Send an e-mail to <a href="mailto:{{email}}?subject=Delete%20my%20account">{{email}}</a> with the subject <strong>"Delete my account"</strong> from the e-mail address registered with your account, or include the mobile number registered with your account. To protect you, we may ask you to confirm the request with a one-time code. We complete deletion requests within <strong>7 days</strong> and confirm by e-mail.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your login (phone / e-mail sign-in) — you can no longer sign in with this account.</li>
  <li>Name, e-mail address, phone number and profile photo (your profile is anonymised as "Deleted user").</li>
  <li>Saved addresses, cart, favourites, notifications and push-notification tokens.</li>
  <li><strong>Delivery partners:</strong> address, location data, driving licence and ID documents, and bank account details.</li>
</ul>

<h2>What we keep, and why</h2>
<table>
  <tr><th>Data</th><th>Why</th><th>How long</th></tr>
  <tr><td>Order, invoice, payment and refund records (items, amounts, delivery address of past orders)</td><td>Tax, accounting and legal obligations; handling disputes and chargebacks</td><td>8 years</td></tr>
  <tr><td>Wallet transactions and delivery-partner payout records</td><td>Financial record-keeping</td><td>8 years</td></tr>
  <tr><td>Product reviews</td><td>Shown anonymously as "Deleted user"; ask us if you want them removed</td><td>Until removed</td></tr>
  <tr><td>Support conversations</td><td>Quality and dispute handling</td><td>Up to 2 years</td></tr>
</table>

<div class="note"><strong>Before you delete:</strong> any remaining <strong>Wallet balance</strong>, referral rewards and coupons are lost when the account is deleted. Use your balance or withdraw the money you added (Wallet → Withdraw) first. Pending orders and returns should be completed or cancelled.</div>

<h2>Questions</h2>
<p>Contact us at <a href="mailto:{{email}}">{{email}}</a> or <a href="tel:{{phone_tel}}">{{phone}}</a>. See also our <a href="/pages/privacy">Privacy Policy</a>.</p>
`;

export const PAGES: Record<string, { title: Record<'en' | 'hi' | 'ar', string>; html: string }> = {
  about: { title: { en: 'About Us', hi: 'हमारे बारे में', ar: 'من نحن' }, html: about },
  terms: { title: { en: 'Terms & Conditions', hi: 'नियम और शर्तें', ar: 'الشروط والأحكام' }, html: terms },
  privacy: { title: { en: 'Privacy Policy', hi: 'गोपनीयता नीति', ar: 'سياسة الخصوصية' }, html: privacy },
  refund: { title: { en: 'Return & Refund Policy', hi: 'वापसी और रिफंड नीति', ar: 'سياسة الإرجاع والاسترداد' }, html: refund },
  'delete-account': { title: { en: 'Delete Your Account', hi: 'अपना खाता हटाएं', ar: 'حذف حسابك' }, html: deleteAccount },
};
