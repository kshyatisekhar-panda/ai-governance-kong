import express from "express";
import path from "path";

const app = express();
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard running on :${PORT}`));
