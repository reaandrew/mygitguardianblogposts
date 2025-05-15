exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: "Hello from Secure LLM Gateway!",
            timestamp: new Date().toISOString()
        })
    };
    return response;
}; 