const asyncHandler = (requestedhandler) => {
  return (req, res, next) => {
    Promise.resolve(requestedhandler(req, res, next)).catch((error) => {
      next(error);
    });
  };
};

export { asyncHandler };
