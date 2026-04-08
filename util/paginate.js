const paginate = async (model, query = {}, options = {}) => {
    let { page = 1, limit = 10, sort = { createdAt: -1 }, populate = "" } = options;
  
    page = parseInt(page);
    limit = parseInt(limit);
  
    const skip = (page - 1) * limit;
  
    const [data, total] = await Promise.all([
      model.find(query).sort(sort).skip(skip).limit(limit).populate(populate),
      model.countDocuments(query),
    ]);
  
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  };
  
  module.exports = paginate;