export const adminOnly = (req, res, next) => {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden: Admin only" });
    }
    next();
  };
  