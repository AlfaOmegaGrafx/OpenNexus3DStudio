#!/usr/bin/env python3
"""Append POST /publish-glb to 3DAIGC-API spatial_fabric router (run on DGX)."""
from pathlib import Path

ROUTER = Path('/home/sifr/3DAIGC-API/api/routers/spatial_fabric.py')
SNIPPET = '''

@router.post("/publish-glb", summary="Upload and publish GLB to MSF object library")
async def publish_glb_upload(
    file: UploadFile = File(...),
    asset_name: Optional[str] = Query(None),
    use_pbr: bool = Query(True),
):
    cfg = _spatial_config()
    if not cfg["public_base_url"]:
        raise HTTPException(
            status_code=503,
            detail="MSF_PUBLIC_BASE_URL is not configured on the API server",
        )

    suffix = os.path.splitext(file.filename or "upload.glb")[1] or ".glb"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        stats = analyze_glb_path(tmp_path)
        tier = recommend_omb_tier(stats, use_pbr=use_pbr)
        stem = asset_name or os.path.splitext(file.filename or "viewport-export")[0]
        published = publish_glb_to_msf(
            tmp_path,
            asset_name=stem,
            objects_dir=cfg["objects_dir"],
            public_base_url=cfg["public_base_url"],
        )
    finally:
        os.unlink(tmp_path)

    return {
        "published": published,
        "stats": stats.to_dict(),
        "omb": tier,
        "fabric_msf_url": cfg["fabric_msf_url"] or None,
        "scene_assembler_url": f"{cfg['public_base_url']}/",
    }
'''


def main() -> None:
    text = ROUTER.read_text(encoding='utf-8')
    if 'publish-glb' in text:
        print('publish-glb already present — skip')
        return
    ROUTER.write_text(text.rstrip() + SNIPPET + '\n', encoding='utf-8')
    print('Added /publish-glb to', ROUTER)


if __name__ == '__main__':
    main()
