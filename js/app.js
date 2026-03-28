import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { cloudinaryConfig, cloudinaryReady } from "./cloudinary-config.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKVK9rUS8rG41sbqA9pmy1RBuE_rObm6w",
  authDomain: "henry-training-institute.firebaseapp.com",
  projectId: "henry-training-institute",
  storageBucket: "henry-training-institute.firebasestorage.app",
  messagingSenderId: "270922281967",
  appId: "1:270922281967:web:c04f2eda1e4187cec4fc1a",
  measurementId: "G-ZRP5797C7R"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

analyticsSupported().then((ok) => {
  if (ok) getAnalytics(app);
}).catch(() => {});

const ADMIN_EMAILS = ["admin@henry.edu", "admin@nexus.edu"];
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80";

const state = {
  authMode: "login",
  user: null,
  profile: null,
  profiles: [],
  students: [],
  classes: [],
  announcements: [],
  unsubscribers: []
};

const els = {
  authView: document.getElementById("auth-view"),
  appView: document.getElementById("app-view"),
  authForm: document.getElementById("auth-form"),
  authTabs: [...document.querySelectorAll(".auth-tab")],
  signupNameGroup: document.getElementById("signup-name-group"),
  signupRoleGroup: document.getElementById("signup-role-group"),
  authSubmit: document.getElementById("auth-submit"),
  authFeedback: document.getElementById("auth-feedback"),
  resetPasswordBtn: document.getElementById("reset-password-btn"),
  guestDemoBtn: document.getElementById("guest-demo-btn"),
  navLinks: [...document.querySelectorAll(".nav-link")],
  pageTitle: document.getElementById("page-title"),
  heroHeading: document.getElementById("hero-heading"),
  heroSubtitle: document.getElementById("hero-subtitle"),
  metricStudents: document.getElementById("metric-students"),
  metricTeachers: document.getElementById("metric-teachers"),
  metricClasses: document.getElementById("metric-classes"),
  metricAnnouncements: document.getElementById("metric-announcements"),
  overviewFeed: document.getElementById("overview-feed"),
  profilesList: document.getElementById("profiles-list"),
  studentsTable: document.getElementById("students-table"),
  classesGrid: document.getElementById("classes-grid"),
  announcementsList: document.getElementById("announcements-list"),
  appFeedback: document.getElementById("app-feedback"),
  sidebarName: document.getElementById("sidebar-name"),
  sidebarRole: document.getElementById("sidebar-role"),
  sidebarPhoto: document.getElementById("sidebar-photo"),
  profilePreview: document.getElementById("profile-preview"),
  profileImageInput: document.getElementById("profile-image"),
  profileForm: document.getElementById("profile-form"),
  studentForm: document.getElementById("student-form"),
  classForm: document.getElementById("class-form"),
  announcementForm: document.getElementById("announcement-form"),
  passwordForm: document.getElementById("password-form"),
  themeToggle: document.getElementById("theme-toggle"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  settingsResetPasswordBtn: document.getElementById("settings-reset-password-btn"),
  seedPeopleBtn: document.getElementById("seed-people-btn")
};

function toast(message, type = "success") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  els.appFeedback.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function setFeedback(message = "", isError = true) {
  els.authFeedback.textContent = message;
  els.authFeedback.style.color = isError ? "var(--danger)" : "var(--success)";
}

function friendlyError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is disabled in Firebase. Enable it in Firebase Console > Authentication > Sign-in method.";
    case "auth/unauthorized-domain":
      return "This site domain is not authorized in Firebase. Add your Netlify domain in Firebase Console > Authentication > Settings > Authorized domains.";
    case "auth/email-already-in-use":
      return "Account already exists. Sign in instead, or use password reset.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Invalid email or password.";
    case "auth/user-not-found":
      return "No account exists for that email yet.";
    case "auth/weak-password":
      return "Choose a stronger password with at least 6 characters.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Firebase permissions blocked this action. Check your Firestore rules and signed-in role.";
    default:
      return error?.message || "Something went wrong.";
  }
}

function cap(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function applyTheme(theme) {
  document.body.classList.toggle("theme-light", theme === "light");
}

function avatarStyle(url) {
  return `background-image: linear-gradient(135deg, rgba(70, 194, 255, 0.24), rgba(255, 182, 72, 0.26)), url('${url || DEFAULT_AVATAR}')`;
}

function roleAllows(role, allowed) {
  return allowed.includes(role);
}

function currentRole() {
  return state.profile?.role || "student";
}

function switchSection(sectionId) {
  document.querySelectorAll(".app-section").forEach((section) => {
    section.classList.toggle("active", section.id === `${sectionId}-section`);
  });
  els.navLinks.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === sectionId);
  });
  els.pageTitle.textContent = cap(sectionId);
}

function dateLabel(value) {
  if (!value) return "Just now";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return date.toLocaleString();
}

async function resolveInitialRole(email, requestedRole) {
  if (ADMIN_EMAILS.includes(email.toLowerCase())) return "admin";
  return requestedRole === "teacher" ? "teacher" : "student";
}

async function ensureProfile(user, draft = {}) {
  const profileRef = doc(db, "profiles", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    const role = await resolveInitialRole(user.email || "", draft.role || "student");
    const newProfile = {
      uid: user.uid,
      email: user.email || "",
      fullName: draft.fullName || user.email?.split("@")[0] || "Portal User",
      role,
      title: role === "admin" ? "School Administrator" : role === "teacher" ? "Teaching Staff" : "Student",
      theme: "dark",
      avatarUrl: "",
      createdAt: serverTimestamp()
    };
    await setDoc(profileRef, newProfile);
    return { id: user.uid, ...newProfile };
  }

  return { id: profileSnap.id, ...profileSnap.data() };
}

function roleScopedAnnouncements() {
  const role = currentRole();
  return state.announcements.filter((item) => item.audience === "all" || item.audience === role);
}

function renderOverview() {
  const teachers = state.profiles.filter((profile) => profile.role === "teacher").length;
  els.metricStudents.textContent = String(state.students.length);
  els.metricTeachers.textContent = String(teachers);
  els.metricClasses.textContent = String(state.classes.length);
  els.metricAnnouncements.textContent = String(roleScopedAnnouncements().length);

  els.heroHeading.textContent = `Welcome back, ${state.profile?.fullName || "Portal User"}.`;
  els.heroSubtitle.textContent = currentRole() === "admin"
    ? "Monitor school operations, manage records, and publish updates for the entire campus."
    : currentRole() === "teacher"
      ? "Track classes, publish notices, and stay aligned with current academic activity."
      : "Follow classes, read announcements, and manage your profile from one place.";

  const items = [
    ...state.students.slice(0, 2).map((student) => ({
      title: student.fullName,
      detail: `${student.grade} · Guardian: ${student.guardian || "N/A"}`
    })),
    ...state.classes.slice(0, 2).map((course) => ({
      title: course.title,
      detail: `${course.schedule} · ${course.room}`
    })),
    ...roleScopedAnnouncements().slice(0, 3).map((item) => ({
      title: item.title,
      detail: `${item.authorName || "School Office"} · ${dateLabel(item.createdAt)}`
    }))
  ];

  els.overviewFeed.innerHTML = items.length
    ? items.map((item) => `<article class="feed-item"><h4>${item.title}</h4><p>${item.detail}</p></article>`).join("")
    : `<article class="feed-item"><h4>No records yet</h4><p>Use the management sections to add classes, people, and announcements.</p></article>`;
}

function renderProfiles() {
  const role = currentRole();
  const profiles = role === "admin"
    ? state.profiles
    : state.profiles.filter((profile) => profile.uid === state.user?.uid || profile.role !== "admin");

  els.profilesList.innerHTML = profiles.map((profile) => {
    const control = role === "admin"
      ? `
        <select class="role-select" data-profile-id="${profile.uid}">
          <option value="admin" ${profile.role === "admin" ? "selected" : ""}>Admin</option>
          <option value="teacher" ${profile.role === "teacher" ? "selected" : ""}>Teacher</option>
          <option value="student" ${profile.role === "student" ? "selected" : ""}>Student</option>
        </select>
      `
      : `<span class="pill subtle">${cap(profile.role)}</span>`;

    return `
      <article class="profile-item">
        <div class="panel-head">
          <div>
            <h4>${profile.fullName}</h4>
            <p>${profile.email}</p>
          </div>
          ${control}
        </div>
        <p>${profile.title || "School user"} · Theme: ${cap(profile.theme || "dark")}</p>
      </article>
    `;
  }).join("") || `<article class="profile-item"><h4>No profiles found</h4><p>Create an account to start using the portal.</p></article>`;

  document.querySelectorAll(".role-select").forEach((select) => {
    select.addEventListener("change", async (event) => {
      try {
        await updateDoc(doc(db, "profiles", event.target.dataset.profileId), { role: event.target.value });
        toast("Role updated.");
      } catch (error) {
        toast(friendlyError(error), "error");
      }
    });
  });
}

function renderStudents() {
  if (!state.students.length) {
    els.studentsTable.innerHTML = `<p>No students have been added yet.</p>`;
    return;
  }

  els.studentsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Grade</th>
          <th>Guardian</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>
        ${state.students.map((student) => `
          <tr>
            <td>${student.fullName}</td>
            <td>${student.grade}</td>
            <td>${student.guardian || "-"}</td>
            <td>${student.email || "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderClasses() {
  const visibleClasses = currentRole() === "student"
    ? state.classes.filter((course) => course.audience !== "staff")
    : state.classes;

  els.classesGrid.innerHTML = visibleClasses.map((course) => `
    <article class="class-tile">
      <div>
        <h4>${course.title}</h4>
        <p>${course.subject}</p>
      </div>
      <div class="class-meta">
        <span>${course.teacherName}</span>
        <span>${course.schedule}</span>
        <span>${course.room}</span>
      </div>
    </article>
  `).join("") || `<article class="class-tile"><h4>No classes yet</h4><p>Create the first class to populate the academic board.</p></article>`;
}

function renderAnnouncements() {
  const items = roleScopedAnnouncements();
  els.announcementsList.innerHTML = items.map((item) => `
    <article class="announcement-item">
      <div class="panel-head">
        <h4>${item.title}</h4>
        <span class="pill subtle">${cap(item.audience || "all")}</span>
      </div>
      <p>${item.message}</p>
      <p>${item.authorName || "School Office"} · ${dateLabel(item.createdAt)}</p>
    </article>
  `).join("") || `<article class="announcement-item"><h4>No announcements yet</h4><p>Notices posted here will appear based on the logged-in role.</p></article>`;
}

function syncSettingsForm() {
  if (!state.profile) return;
  els.profileForm.fullName.value = state.profile.fullName || "";
  els.profileForm.title.value = state.profile.title || "";
  els.profileForm.theme.value = state.profile.theme || "dark";
  els.profilePreview.style.backgroundImage = avatarStyle(state.profile.avatarUrl);
  els.sidebarPhoto.style.backgroundImage = avatarStyle(state.profile.avatarUrl);
  els.sidebarName.textContent = state.profile.fullName || "Portal User";
  els.sidebarRole.textContent = `${cap(state.profile.role || "student")} · ${state.profile.email || ""}`;
}

function applyRoleUi() {
  const role = currentRole();

  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("role-hidden", role !== "admin");
  });
  document.querySelectorAll(".role-admin-teacher").forEach((node) => {
    node.classList.toggle("role-hidden", !roleAllows(role, ["admin", "teacher"]));
  });

  els.navLinks.forEach((link) => {
    const hidePeople = role === "student" && link.dataset.section === "people";
    link.classList.toggle("role-hidden", hidePeople);
  });

  const currentActive = els.navLinks.find((link) => link.classList.contains("active") && !link.classList.contains("role-hidden"));
  if (!currentActive) {
    const nextLink = els.navLinks.find((link) => !link.classList.contains("role-hidden"));
    if (nextLink) switchSection(nextLink.dataset.section);
  }
}

function renderAll() {
  applyTheme(state.profile?.theme || "dark");
  syncSettingsForm();
  applyRoleUi();
  renderOverview();
  renderProfiles();
  renderStudents();
  renderClasses();
  renderAnnouncements();
}

function resetSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function subscribeToData() {
  resetSubscriptions();

  state.unsubscribers.push(onSnapshot(collection(db, "profiles"), (snapshot) => {
    state.profiles = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    state.profile = state.profiles.find((profile) => profile.uid === state.user?.uid) || state.profile;
    renderAll();
  }, (error) => toast(friendlyError(error), "error")));

  state.unsubscribers.push(onSnapshot(query(collection(db, "students")), (snapshot) => {
    state.students = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    renderAll();
  }, (error) => toast(friendlyError(error), "error")));

  state.unsubscribers.push(onSnapshot(query(collection(db, "classes")), (snapshot) => {
    state.classes = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    renderAll();
  }, (error) => toast(friendlyError(error), "error")));

  state.unsubscribers.push(onSnapshot(query(collection(db, "announcements")), (snapshot) => {
    state.announcements = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
    renderAll();
  }, (error) => toast(friendlyError(error), "error")));
}

async function uploadProfileImage(file, uid) {
  if (!cloudinaryReady()) {
    throw new Error("Add your Cloudinary cloud name and unsigned upload preset in js/cloudinary-config.js.");
  }

  const payload = new FormData();
  payload.append("file", file);
  payload.append("upload_preset", cloudinaryConfig.unsignedUploadPreset);
  payload.append("folder", cloudinaryConfig.folder);
  payload.append("public_id", `${uid}-${Date.now()}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
    method: "POST",
    body: payload
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || "Cloudinary upload failed.");
  }

  const result = await response.json();
  return result.secure_url;
}

async function saveProfileAvatar(file) {
  if (!state.user || !file) return;

  const localPreviewUrl = URL.createObjectURL(file);
  els.profilePreview.style.backgroundImage = avatarStyle(localPreviewUrl);
  els.sidebarPhoto.style.backgroundImage = avatarStyle(localPreviewUrl);
  toast("Uploading profile picture...");

  try {
    const avatarUrl = await uploadProfileImage(file, state.user.uid);
    await updateDoc(doc(db, "profiles", state.user.uid), { avatarUrl });
    toast("Profile picture updated.");
  } catch (error) {
    els.profilePreview.style.backgroundImage = avatarStyle(state.profile?.avatarUrl);
    els.sidebarPhoto.style.backgroundImage = avatarStyle(state.profile?.avatarUrl);
    toast(friendlyError(error), "error");
  } finally {
    URL.revokeObjectURL(localPreviewUrl);
    if (els.profileImageInput) els.profileImageInput.value = "";
  }
}

async function seedExampleData() {
  const studentsSnapshot = await getDocs(collection(db, "students"));
  const classesSnapshot = await getDocs(collection(db, "classes"));
  const announcementsSnapshot = await getDocs(collection(db, "announcements"));

  const tasks = [];

  if (studentsSnapshot.empty) {
    tasks.push(
      addDoc(collection(db, "students"), {
        fullName: "Grace Mwesiga",
        grade: "Grade 11",
        guardian: "Mr. and Mrs. Mwesiga",
        email: "grace@student.henry.edu",
        createdAt: serverTimestamp()
      }),
      addDoc(collection(db, "students"), {
        fullName: "Daniel Okoro",
        grade: "Grade 9",
        guardian: "Mrs. Esther Okoro",
        email: "daniel@student.henry.edu",
        createdAt: serverTimestamp()
      })
    );
  }

  if (classesSnapshot.empty) {
    tasks.push(
      addDoc(collection(db, "classes"), {
        title: "Advanced Mathematics",
        subject: "Mathematics",
        teacherName: "Mr. David Miller",
        schedule: "Mon / Wed 9:00 AM",
        room: "Block A2",
        createdAt: serverTimestamp()
      }),
      addDoc(collection(db, "classes"), {
        title: "Integrated Science Lab",
        subject: "Science",
        teacherName: "Dr. Sarah Connor",
        schedule: "Tue / Thu 11:00 AM",
        room: "Science Lab",
        createdAt: serverTimestamp()
      })
    );
  }

  if (announcementsSnapshot.empty) {
    tasks.push(
      addDoc(collection(db, "announcements"), {
        title: "Welcome to the Portal",
        message: "This noticeboard shares school-wide information in real time.",
        audience: "all",
        authorName: state.profile?.fullName || "School Office",
        createdAt: serverTimestamp()
      })
    );
  }

  await Promise.all(tasks);
  toast(tasks.length ? "Example data added." : "Sample data already exists.");
}

els.authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.authMode = tab.dataset.authMode;
    els.authTabs.forEach((button) => button.classList.toggle("active", button === tab));
    els.signupNameGroup.classList.toggle("hidden", state.authMode !== "signup");
    els.signupRoleGroup.classList.toggle("hidden", state.authMode !== "signup");
    els.authSubmit.textContent = state.authMode === "signup" ? "Create Account" : "Sign In";
    setFeedback("");
  });
});

els.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback("");
  const formData = new FormData(els.authForm);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "student");

  try {
    if (state.authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await ensureProfile(credential.user, { fullName, role });
      setFeedback("Account created successfully.", false);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    els.authForm.reset();
  } catch (error) {
    setFeedback(friendlyError(error), true);
  }
});

els.resetPasswordBtn.addEventListener("click", async () => {
  const emailField = document.getElementById("auth-email");
  const email = String(emailField?.value || "").trim().toLowerCase();
  if (!email) {
    setFeedback("Enter your email first to receive a reset link.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setFeedback("Password reset email sent.", false);
  } catch (error) {
    setFeedback(friendlyError(error), true);
  }
});

els.settingsResetPasswordBtn.addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, state.user.email);
    toast("Reset link sent to your email.");
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.guestDemoBtn.addEventListener("click", () => {
  setFeedback("Create the first account with your preferred admin email. After that, additional users can sign up as teacher or student.", false);
});

els.navLinks.forEach((link) => {
  link.addEventListener("click", () => switchSection(link.dataset.section));
});

els.themeToggle.addEventListener("click", async () => {
  if (!state.profile) return;
  const nextTheme = state.profile.theme === "light" ? "dark" : "light";
  try {
    await updateDoc(doc(db, "profiles", state.user.uid), { theme: nextTheme });
    toast(`Theme changed to ${nextTheme}.`);
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.refreshBtn.addEventListener("click", () => {
  subscribeToData();
  toast("Data refresh requested.");
});

els.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

els.seedPeopleBtn.addEventListener("click", async () => {
  try {
    await seedExampleData();
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.studentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.studentForm);
  try {
    await addDoc(collection(db, "students"), {
      fullName: String(formData.get("fullName") || "").trim(),
      grade: String(formData.get("grade") || "").trim(),
      guardian: String(formData.get("guardian") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      createdAt: serverTimestamp()
    });
    els.studentForm.reset();
    toast("Student saved.");
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.classForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.classForm);
  try {
    await addDoc(collection(db, "classes"), {
      title: String(formData.get("title") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      teacherName: String(formData.get("teacherName") || "").trim(),
      schedule: String(formData.get("schedule") || "").trim(),
      room: String(formData.get("room") || "").trim(),
      createdAt: serverTimestamp()
    });
    els.classForm.reset();
    toast("Class published.");
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.announcementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.announcementForm);
  try {
    await addDoc(collection(db, "announcements"), {
      title: String(formData.get("title") || "").trim(),
      message: String(formData.get("message") || "").trim(),
      audience: String(formData.get("audience") || "all"),
      authorId: state.user.uid,
      authorName: state.profile?.fullName || state.user.email,
      createdAt: serverTimestamp()
    });
    els.announcementForm.reset();
    toast("Announcement posted.");
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.profileForm);

  try {
    await updateDoc(doc(db, "profiles", state.user.uid), {
      fullName: String(formData.get("fullName") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      theme: String(formData.get("theme") || "dark")
    });
    toast("Profile updated.");
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});

els.profileImageInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await saveProfileAvatar(file);
});

els.passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(new FormData(els.passwordForm).get("newPassword") || "");
  if (password.length < 6) {
    toast("Password must be at least 6 characters.", "error");
    return;
  }
  try {
    await updatePassword(auth.currentUser, password);
    els.passwordForm.reset();
    toast("Password updated.");
  } catch (error) {
    const message = error.code === "auth/requires-recent-login"
      ? "For security reasons, use the reset email link or sign in again before changing password."
      : friendlyError(error);
    toast(message, "error");
  }
});

onAuthStateChanged(auth, async (user) => {
  resetSubscriptions();
  if (!user) {
    state.user = null;
    state.profile = null;
    state.profiles = [];
    state.students = [];
    state.classes = [];
    state.announcements = [];
    els.authView.classList.remove("hidden");
    els.appView.classList.add("hidden");
    applyTheme("dark");
    switchSection("overview");
    return;
  }

  try {
    state.user = user;
    state.profile = await ensureProfile(user);
    els.authView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    subscribeToData();
    renderAll();
  } catch (error) {
    toast(friendlyError(error), "error");
  }
});
