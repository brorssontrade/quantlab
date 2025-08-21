from fastapi import FastAPI, Request
import uvicorn, json
app = FastAPI()
@app.post("/alert")
async def alert(req: Request):
    payload = await req.json()
    print("ALERT:", json.dumps(payload, ensure_ascii=False))
    return {"ok": True}
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
