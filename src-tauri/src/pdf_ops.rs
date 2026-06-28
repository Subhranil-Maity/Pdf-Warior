use crate::errors::{AppError, Result};
use lopdf::{Document, Object, ObjectId};
use pdfium_render::prelude::*;
use std::collections::HashMap;

#[derive(serde::Deserialize, Clone)]
pub struct PageManifestEntry {
    pub source_file: String,
    pub source_page_index: u32,
    pub rotation: i32,
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
}

fn get_float(obj: &Object) -> Option<f32> {
    match obj {
        Object::Integer(i) => Some(*i as f32),
        Object::Real(f) => Some(*f as f32),
        _ => None,
    }
}

pub fn page_count(path: &str) -> Result<u32> {
    let doc = Document::load(path)?;
    Ok(doc.get_pages().len() as u32)
}

fn get_pdfium() -> Result<Pdfium> {
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./"))
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| AppError::Render(e.to_string()))?;
    Ok(Pdfium::new(bindings))
}

pub fn render_page_to_png(path: &str, page_index: u32, width_px: u32) -> Result<Vec<u8>> {
    let pdfium = get_pdfium()?;
    let document = pdfium.load_pdf_from_file(path, None).map_err(|e| AppError::Render(e.to_string()))?;
    let pages = document.pages();
    let page = pages.get(page_index as u16).map_err(|e| AppError::Render(e.to_string()))?;

    let config = PdfRenderConfig::new()
        .set_target_width(width_px as i32)
        .set_maximum_height(8000);

    let bitmap = page.render_with_config(&config).map_err(|e| AppError::Render(e.to_string()))?;
    let image = bitmap.as_image();

    let mut bytes = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| AppError::Render(e.to_string()))?;

    Ok(bytes)
}

fn deep_copy_object(
    obj_id: ObjectId,
    src_doc: &Document,
    out_doc: &mut Document,
    id_map: &mut HashMap<ObjectId, ObjectId>,
) -> Result<ObjectId> {
    if let Some(&new_id) = id_map.get(&obj_id) {
        return Ok(new_id);
    }
    
    let mut obj = src_doc.get_object(obj_id)?.clone();
    let new_id = out_doc.add_object(Object::Null); // placeholder
    id_map.insert(obj_id, new_id);
    
    // Remap references inside the object
    remap_references(&mut obj, src_doc, out_doc, id_map)?;
    
    out_doc.set_object(new_id, obj);
    Ok(new_id)
}

fn remap_references(
    obj: &mut Object,
    src_doc: &Document,
    out_doc: &mut Document,
    id_map: &mut HashMap<ObjectId, ObjectId>,
) -> Result<()> {
    match obj {
        Object::Reference(ref mut id) => {
            *id = deep_copy_object(*id, src_doc, out_doc, id_map)?;
        }
        Object::Array(arr) => {
            for item in arr.iter_mut() {
                remap_references(item, src_doc, out_doc, id_map)?;
            }
        }
        Object::Dictionary(dict) => {
            for (_, item) in dict.iter_mut() {
                remap_references(item, src_doc, out_doc, id_map)?;
            }
        }
        Object::Stream(stream) => {
            for (_, item) in stream.dict.iter_mut() {
                remap_references(item, src_doc, out_doc, id_map)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub fn merge_pages<F>(
    manifest: &[PageManifestEntry],
    out_path: &str,
    progress_cb: F,
) -> Result<()>
where
    F: Fn(usize, usize),
{
    let mut out_doc = Document::with_version("1.5");
    let pages_id = out_doc.new_object_id();
    let mut pages_dict = lopdf::Dictionary::new();
    pages_dict.set("Type", "Pages");
    
    let mut kids = vec![];
    let mut doc_cache: HashMap<String, Document> = HashMap::new();
    let total = manifest.len();
    
    for (i, entry) in manifest.iter().enumerate() {
        if !doc_cache.contains_key(&entry.source_file) {
            let mut doc = Document::load(&entry.source_file)?;
            doc.decompress();
            doc_cache.insert(entry.source_file.clone(), doc);
        }
        
        let src_doc = doc_cache.get(&entry.source_file).unwrap();
        let src_pages = src_doc.get_pages();
        let src_page_id = src_pages.get(&(entry.source_page_index + 1))
            .ok_or_else(|| AppError::Pdf(format!("Page not found: {}", entry.source_page_index)))?;
            
        let mut id_map = HashMap::new();
        let new_page_id = deep_copy_object(*src_page_id, src_doc, &mut out_doc, &mut id_map)?;
        
        // Update Parent reference in the copied page object
        if let Ok(Object::Dictionary(ref mut page_dict)) = out_doc.get_object_mut(new_page_id) {
            page_dict.set("Parent", pages_id);
        }

        // Apply rotation if needed
        if entry.rotation != 0 {
            let mut existing_rotation = 0;
            if let Ok(Object::Dictionary(ref page_dict)) = out_doc.get_object(new_page_id) {
                if let Ok(Object::Integer(r)) = page_dict.get(b"Rotate") {
                    existing_rotation = *r;
                }
            }
            let new_rotation = (existing_rotation + entry.rotation as i64) % 360;
            let new_rotation = (new_rotation + 360) % 360;
            if let Ok(Object::Dictionary(ref mut page_dict)) = out_doc.get_object_mut(new_page_id) {
                page_dict.set("Rotate", Object::Integer(new_rotation));
            }
        }

        // Apply flips (horizontal / vertical) if needed
        if entry.flip_horizontal || entry.flip_vertical {
            let mut media_box = vec![0.0, 0.0, 612.0, 792.0]; // default US letter
            let mut contents_obj = None;

            if let Ok(Object::Dictionary(ref page_dict)) = out_doc.get_object(new_page_id) {
                if let Ok(Object::Array(ref arr)) = page_dict.get(b"MediaBox") {
                    if arr.len() >= 4 {
                        for (idx, val) in arr.iter().take(4).enumerate() {
                            if let Some(num) = get_float(val) {
                                media_box[idx] = num;
                            }
                        }
                    }
                }
                if let Ok(contents) = page_dict.get(b"Contents") {
                    contents_obj = Some(contents.clone());
                }
            }

            let x_ll = media_box[0];
            let y_ll = media_box[1];
            let x_ur = media_box[2];
            let y_ur = media_box[3];

            let tx = x_ll + x_ur;
            let ty = y_ll + y_ur;

            let scale_x = if entry.flip_horizontal { -1.0 } else { 1.0 };
            let scale_y = if entry.flip_vertical { -1.0 } else { 1.0 };
            let tx_val = if entry.flip_horizontal { tx } else { 0.0 };
            let ty_val = if entry.flip_vertical { ty } else { 0.0 };

            let prepend_content = format!("q {} 0 0 {} {} {} cm\n", scale_x, scale_y, tx_val, ty_val);
            let prepend_stream = lopdf::Stream::new(lopdf::Dictionary::new(), prepend_content.into_bytes());
            let prepend_id = out_doc.add_object(prepend_stream);

            let append_stream = lopdf::Stream::new(lopdf::Dictionary::new(), b"\nQ\n".to_vec());
            let append_id = out_doc.add_object(append_stream);

            let mut new_contents = vec![Object::Reference(prepend_id)];
            if let Some(ref contents) = contents_obj {
                match contents {
                    Object::Reference(ref_id) => {
                        new_contents.push(Object::Reference(*ref_id));
                    }
                    Object::Array(arr) => {
                        new_contents.extend(arr.clone());
                    }
                    other => {
                        let direct_id = out_doc.add_object(other.clone());
                        new_contents.push(Object::Reference(direct_id));
                    }
                }
            }
            new_contents.push(Object::Reference(append_id));

            if let Ok(Object::Dictionary(ref mut page_dict)) = out_doc.get_object_mut(new_page_id) {
                page_dict.set("Contents", Object::Array(new_contents));
            }
        }
        
        kids.push(Object::Reference(new_page_id));
        progress_cb(i + 1, total);
    }
    
    pages_dict.set("Kids", Object::Array(kids));
    pages_dict.set("Count", manifest.len() as i32);
    out_doc.set_object(pages_id, Object::Dictionary(pages_dict));
    
    let mut catalog_dict = lopdf::Dictionary::new();
    catalog_dict.set("Type", "Catalog");
    catalog_dict.set("Pages", pages_id);
    let catalog_id = out_doc.add_object(catalog_dict);
    
    out_doc.trailer.set("Root", catalog_id);
    out_doc.max_id = out_doc.objects.keys().copied().max().unwrap_or((0, 0)).0;
    out_doc.save(out_path).map(|_| ()).map_err(|e| e.into())
}
