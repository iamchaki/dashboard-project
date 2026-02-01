// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAUlnZA9Lsdbahobd7s4r21sdirjAf6OLQ",
    authDomain: "dashboardproject-bb315.firebaseapp.com",
    projectId: "dashboardproject-bb315",
    storageBucket: "dashboardproject-bb315.firebasestorage.app",
    messagingSenderId: "430292777166",
    appId: "1:430292777166:web:d5aec24414ca0ad253389f",
    measurementId: "G-BXMN46GYSZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Helper for stocks
if (!localStorage.getItem('app_stocks')) localStorage.setItem('app_stocks', JSON.stringify([]));

// --- MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT ---
    let currentUser = null;

    // --- DOM ELEMENTS ---
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const navItems = document.querySelectorAll('.nav-links li');
    const views = document.querySelectorAll('.view-section');

    // --- 1. LOGIN LOGIC ---
    loginBtn.addEventListener('click', async () => {
        const usernameInput = document.getElementById('login-username').value.trim();

        // Automatically add a domain if the user didn't type one
        const email = usernameInput.includes('@') ? usernameInput : `${usernameInput}@veggiestock.com`;

        const pass = document.getElementById('login-password').value;
        const errorMsg = document.getElementById('login-error');

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // Success! The onAuthStateChanged listener handles the rest...
        } catch (error) {
            console.error("Login Error:", error);
            if (error.code === 'auth/invalid-email') {
                errorMsg.innerText = "Invalid username format.";
            } else if (error.code === 'auth/invalid-credential') {
                errorMsg.innerText = "Wrong password or user not found.";
            } else {
                errorMsg.innerText = "Login failed: " + error.message;
            }
        }
    });

    // Listener to handle user state changes automatically
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User logged in. Check Role.
            let userRole = 'User'; // Default
            let userName = user.email;

            try {
                const q = query(collection(db, "users"), where("email", "==", user.email));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    userRole = userData.role;
                    userName = userData.username;
                } else if (user.email === 'admin@veggiestock.com') {
                    // Safety net: Always let the main admin be an Admin
                    userRole = 'Admin';
                }
            } catch (e) {
                console.error("Error fetching role:", e);
            }

            currentUser = { username: userName, email: user.email, role: userRole };
            initApp();
        } else {
            // User is signed out
            mainApp.style.display = 'none';
            loginScreen.style.display = 'flex';
        }
    });

    // --- GLOBAL DATA VARIABLES ---
    let globalStockData = [];
    let globalUserData = [];

    function initApp() {
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';

        // --- DYNAMIC THEME SWITCHING ---
        // 1. Remove old theme classes first
        document.body.classList.remove('theme-user');

        // 2. Apply theme based on Role
        if (currentUser.role === 'User') {
            document.body.classList.add('theme-user');
            // Optional: Change the profile picture border color dynamically
            document.getElementById('profile-img').style.borderColor = '#10b981';
        } else {
            // Admin keeps the default blue
            document.getElementById('profile-img').style.borderColor = '#4e73df';
        }

        // --- REST OF INIT APP ---
        document.getElementById('profile-name').innerText = currentUser.username;
        document.getElementById('profile-role').innerText = currentUser.role;
        document.getElementById('date-display').innerText = `Welcome back, ${currentUser.username}`;

        // Hide "Users" tab if not Admin
        const usersLink = document.getElementById('nav-users');
        if (currentUser.role !== 'Admin') {
            usersLink.style.display = 'none';
        } else {
            usersLink.style.display = 'block';
        }

        // Start Real-Time Listeners
        startRealTimeData();
        switchView('dashboard');
    }

    function startRealTimeData() {
        // 1. LISTEN TO STOCKS (Updates Dashboard AND Table)
        onSnapshot(collection(db, "stocks"), (snapshot) => {
            globalStockData = []; // Reset local list
            const tableBody = document.getElementById('stock-table-body');
            if (tableBody) tableBody.innerHTML = '';

            snapshot.forEach((doc) => {
                const item = doc.data();
                globalStockData.push(item);

                // Render Table Row
                const status = item.qty < 10
                    ? '<span class="badge-role" style="background:#fed7d7; color:#c53030;">Low Stock</span>'
                    : '<span class="badge-role" style="background:#d1fae5; color:#10b981;">Available</span>';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.name}</td>
                    <td>${item.qty} kg</td>
                    <td>₹${item.price}</td>
                    <td>₹${item.qty * item.price}</td>
                    <td>${status}</td>
                `;
                if (tableBody) tableBody.appendChild(tr);
            });

            // Trigger Dashboard Update
            updateDashboardCards();
        });

        // 2. LISTEN TO USERS (Updates Dashboard AND Table)
        onSnapshot(collection(db, "users"), (snapshot) => {
            globalUserData = [];
            const userTableBody = document.getElementById('user-table-body');
            if (userTableBody) userTableBody.innerHTML = '';

            snapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const docId = docSnap.id;
                globalUserData.push(user);

                // Render User Table Row
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${user.username} <br><small style="color:#888">${user.email}</small></td>
                    <td><span class="badge-role ${user.role === 'Admin' ? 'role-admin' : 'role-user'}">${user.role}</span></td>
                    <td>Active</td>
                    <td>
                        ${user.email !== currentUser.email ?
                        `<button class="delete-btn" data-id="${docId}"><i class="fa-solid fa-trash"></i></button>`
                        : '<span style="color:#ccc; font-size:0.8rem;">Current</span>'}
                    </td>
                `;
                if (userTableBody) userTableBody.appendChild(tr);
            });

            // Re-attach delete listeners
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => deleteUser(e.target.closest('button').dataset.id));
            });

            // Trigger Dashboard Update
            updateDashboardCards();
        });
    }

    // --- DASHBOARD RENDER LOGIC ---
    function updateDashboardCards() {
        // 1. Calculate Metrics
        const totalValue = globalStockData.reduce((acc, curr) => acc + (curr.qty * curr.price), 0);
        const lowStockCount = globalStockData.filter(s => s.qty < 10).length;
        const stockItemsCount = globalStockData.length;
        const totalUsersCount = globalUserData.length;

        // 2. Critical Rule (Value < 50,000)
        const isCritical = totalValue < 50000;

        // Define Colors
        const styleRed = "background: #fee2e2; color: #991b1b; border: 1px solid #ef4444;";
        const styleGreen = "background: #d1fae5; color: #065f46; border: 1px solid #10b981;";

        // 3. Define Card Data
        const dataCards = [
            {
                title: "Inventory Value",
                value: `₹${totalValue.toLocaleString()}`,
                icon: "fa-indian-rupee-sign"
            },
            {
                title: "Total Users",
                value: totalUsersCount || "0",
                icon: "fa-users"
            },
            {
                title: "Stock Items",
                value: stockItemsCount || "0",
                icon: "fa-boxes-stacked"
            },
            {
                title: "Low Stock Alerts",
                value: lowStockCount || "0",
                icon: "fa-triangle-exclamation",
                customStyle: isCritical ? styleRed : styleGreen
            }
        ];

        // 4. Render HTML
        const cardsContainer = document.getElementById('cards-container');
        if (!cardsContainer) return;

        cardsContainer.innerHTML = '';
        dataCards.forEach(item => {
            const card = document.createElement('div');
            card.classList.add('card');

            if (item.customStyle) {
                card.style.cssText = item.customStyle;
            }

            card.innerHTML = `
                <div class="card-icon"><i class="fa-solid ${item.icon}"></i></div>
                <h3>${item.title}</h3>
                <p class="value">${item.value}</p>
            `;
            cardsContainer.appendChild(card);
        });
    }

    // --- THEME TOGGLE (DARK MODE) ---
    const themeBtn = document.getElementById('theme-toggle');
    const themeText = document.getElementById('theme-text');
    const themeIcon = themeBtn ? themeBtn.querySelector('i') : null;

    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
        if (themeText) themeText.innerText = 'Light Mode';
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');

            if (isDark) {
                themeIcon.classList.replace('fa-moon', 'fa-sun');
                themeText.innerText = 'Light Mode';
                localStorage.setItem('theme', 'dark');
            } else {
                themeIcon.classList.replace('fa-sun', 'fa-moon');
                themeText.innerText = 'Dark Mode';
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // --- 2. LOGOUT LOGIC ---
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        signOut(auth).then(() => {
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        });
    });

    // --- 3. NAVIGATION & VIEW SWITCHING (UPDATED) ---
    function switchView(viewName) {
        // 1. Hide all views
        views.forEach(view => view.style.display = 'none');

        if (viewName === 'dashboard') {
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('page-title').innerText = 'Analytics Overview';
            updateDashboardCards();

        } else if (viewName === 'users') {
            document.getElementById('users-section').style.display = 'block';
            document.getElementById('page-title').innerText = 'User Management';

        } else if (viewName === 'stocks') {
            document.getElementById('stocks-section').style.display = 'block';
            document.getElementById('page-title').innerText = 'Stock Inventory';

            // --- FIX START: Clear inputs to prevent duplicates ---
            const nameInput = document.getElementById('veg-name');
            const qtyInput = document.getElementById('veg-qty');
            const priceInput = document.getElementById('veg-price');

            if (nameInput) nameInput.value = '';
            if (qtyInput) qtyInput.value = '';
            if (priceInput) priceInput.value = '';
            // --- FIX END ---
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', function () {
            navItems.forEach(n => n.classList.remove('active'));
            this.classList.add('active');

            const viewTarget = this.id.replace('nav-', '');
            switchView(viewTarget);

            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
                document.getElementById('sidebar-overlay').classList.remove('active');
            }
        });
    });

    // --- 4. USER MANAGEMENT (Add User Logic) ---
    const addUserBtn = document.getElementById('add-user-btn');

    if (addUserBtn) {
        addUserBtn.addEventListener('click', async () => {
            const newName = document.getElementById('new-username').value;
            const newPass = document.getElementById('new-password').value;
            const newRole = document.getElementById('new-role').value;

            // Auto-generate email based on username
            const newEmail = newName.includes('@') ? newName : `${newName}@veggiestock.com`;

            if (newName && newPass) {
                try {
                    // Create a secondary app to create the user WITHOUT logging out the Admin
                    const secondaryApp = initializeApp(firebaseConfig, "Secondary");
                    const secondaryAuth = getAuth(secondaryApp);

                    // 1. Create the Authentication Login
                    await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPass);

                    // 2. Save the details to Firestore Database
                    await addDoc(collection(db, "users"), {
                        username: newName,
                        email: newEmail,
                        role: newRole,
                        createdAt: new Date().toISOString()
                    });

                    // 3. Clean up the secondary app
                    await signOut(secondaryAuth);

                    alert(`User Created!\nEmail: ${newEmail}\nPassword: ${newPass}`);

                    // Clear inputs
                    document.getElementById('new-username').value = '';
                    document.getElementById('new-password').value = '';

                } catch (error) {
                    alert("Error creating user: " + error.message);
                }
            } else {
                alert("Please fill in username and password");
            }
        });
    }

    // Delete User (Only from Database List)
    window.deleteUser = async function (id) {
        if (!confirm('Are you sure you want to remove this user from the list? (Note: This does not block their login yet, you must disable them in Firebase Console for full security)')) return;
        try {
            await deleteDoc(doc(db, "users", id));
        } catch (e) {
            alert("Error deleting: " + e.message);
        }
    };

    // --- 5. STOCK MANAGEMENT (Add Stock Logic) ---
    const addStockBtn = document.getElementById('add-stock-btn');
    if (addStockBtn) {
        addStockBtn.addEventListener('click', async () => {
            const name = document.getElementById('veg-name').value;
            const qty = parseFloat(document.getElementById('veg-qty').value);
            const price = parseFloat(document.getElementById('veg-price').value);

            if (name && !isNaN(qty) && !isNaN(price)) {
                try {
                    await addDoc(collection(db, "stocks"), {
                        name: name,
                        qty: qty,
                        price: price
                    });
                    alert("Stock added to Cloud!");

                    // Optional: Clear fields immediately after successful add as well
                    document.getElementById('veg-name').value = '';
                    document.getElementById('veg-qty').value = '';
                    document.getElementById('veg-price').value = '';

                } catch (e) {
                    alert("Error adding stock: " + e.message);
                }
            }
        });
    }

    // --- 6. SIDEBAR TOGGLE ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebarToggle && sidebar && overlay) {
        const toggleMenu = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };
        sidebarToggle.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', toggleMenu);
    }
});