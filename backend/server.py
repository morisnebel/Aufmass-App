from fastapi import FastAPI, APIRouter, HTTPException, File, UploadFile
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
import base64
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import math
from PIL import Image as PILImage, ImageDraw
import json
import cairosvg
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc

# Models
class Customer(BaseModel):
    id: Optional[str] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RoofMeasurement(BaseModel):
    id: Optional[str] = None
    project_id: str
    roof_type: str  # Satteldach, Walmdach, Flachdach, Pultdach
    measurements: Dict[str, float]  # Dynamic measurements based on roof type
    area: float  # Calculated area in m²
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Photo(BaseModel):
    id: Optional[str] = None
    project_id: str
    image_data: str  # base64
    annotations: Optional[str] = None  # JSON string of annotations
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Sketch(BaseModel):
    id: Optional[str] = None
    project_id: str
    sketch_data: str  # base64 image
    title: Optional[str] = None
    metadata: Optional[str] = None  # JSON string of sketch elements and settings
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChecklistTemplate(BaseModel):
    id: Optional[str] = None
    name: str
    items: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChecklistInstance(BaseModel):
    id: Optional[str] = None
    project_id: str
    template_id: str
    template_name: str
    items: List[Dict[str, Any]]  # [{"text": str, "checked": bool}]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Project(BaseModel):
    id: Optional[str] = None
    customer_id: str
    name: str
    description: Optional[str] = None
    status: str = "active"  # active, completed, archived
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Customer endpoints
@api_router.post("/customers", response_model=Customer)
async def create_customer(customer: Customer):
    customer_dict = customer.dict(exclude={'id'})
    result = await db.customers.insert_one(customer_dict)
    customer_dict['id'] = str(result.inserted_id)
    return Customer(**customer_dict)

@api_router.get("/customers", response_model=List[Customer])
async def get_customers():
    customers = await db.customers.find().to_list(1000)
    return [Customer(**serialize_doc(c)) for c in customers]

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return Customer(**serialize_doc(customer))

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, customer: Customer):
    customer_dict = customer.dict(exclude={'id', 'created_at'})
    result = await db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$set": customer_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    updated_customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    return Customer(**serialize_doc(updated_customer))

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str):
    result = await db.customers.delete_one({"_id": ObjectId(customer_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer deleted"}

# Project endpoints
@api_router.post("/projects", response_model=Project)
async def create_project(project: Project):
    project_dict = project.dict(exclude={'id'})
    result = await db.projects.insert_one(project_dict)
    project_dict['id'] = str(result.inserted_id)
    return Project(**project_dict)

@api_router.get("/projects", response_model=List[Project])
async def get_projects():
    projects = await db.projects.find().sort("created_at", -1).to_list(1000)
    return [Project(**serialize_doc(p)) for p in projects]

@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return Project(**serialize_doc(project))

@api_router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, project: Project):
    project_dict = project.dict(exclude={'id', 'created_at'})
    project_dict['updated_at'] = datetime.utcnow()
    result = await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": project_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    updated_project = await db.projects.find_one({"_id": ObjectId(project_id)})
    return Project(**serialize_doc(updated_project))

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    # Also delete related data
    await db.roofs.delete_many({"project_id": project_id})
    await db.photos.delete_many({"project_id": project_id})
    await db.sketches.delete_many({"project_id": project_id})
    await db.checklists.delete_many({"project_id": project_id})
    
    result = await db.projects.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}

# Roof measurements
@api_router.post("/roofs", response_model=RoofMeasurement)
async def create_roof(roof: RoofMeasurement):
    roof_dict = roof.dict(exclude={'id'})
    result = await db.roofs.insert_one(roof_dict)
    roof_dict['id'] = str(result.inserted_id)
    return RoofMeasurement(**roof_dict)

@api_router.get("/roofs/project/{project_id}", response_model=List[RoofMeasurement])
async def get_project_roofs(project_id: str):
    roofs = await db.roofs.find({"project_id": project_id}).to_list(1000)
    return [RoofMeasurement(**serialize_doc(r)) for r in roofs]

@api_router.put("/roofs/{roof_id}", response_model=RoofMeasurement)
async def update_roof(roof_id: str, roof: RoofMeasurement):
    roof_dict = roof.dict(exclude={'id', 'created_at'})
    result = await db.roofs.update_one(
        {"_id": ObjectId(roof_id)},
        {"$set": roof_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roof not found")
    updated_roof = await db.roofs.find_one({"_id": ObjectId(roof_id)})
    return RoofMeasurement(**serialize_doc(updated_roof))

@api_router.delete("/roofs/{roof_id}")
async def delete_roof(roof_id: str):
    result = await db.roofs.delete_one({"_id": ObjectId(roof_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Roof not found")
    return {"message": "Roof deleted"}

# Photos
@api_router.post("/photos", response_model=Photo)
async def create_photo(photo: Photo):
    photo_dict = photo.dict(exclude={'id'})
    result = await db.photos.insert_one(photo_dict)
    photo_dict['id'] = str(result.inserted_id)
    return Photo(**photo_dict)

@api_router.get("/photos/project/{project_id}", response_model=List[Photo])
async def get_project_photos(project_id: str):
    photos = await db.photos.find({"project_id": project_id}).to_list(1000)
    return [Photo(**serialize_doc(p)) for p in photos]

@api_router.put("/photos/{photo_id}", response_model=Photo)
async def update_photo(photo_id: str, photo: Photo):
    photo_dict = photo.dict(exclude={'id'})
    result = await db.photos.update_one(
        {"_id": ObjectId(photo_id)},
        {"$set": photo_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo_dict['id'] = photo_id
    return Photo(**photo_dict)

@api_router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str):
    result = await db.photos.delete_one({"_id": ObjectId(photo_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"message": "Photo deleted"}

# Sketches
@api_router.post("/sketches", response_model=Sketch)
async def create_sketch(sketch: Sketch):
    sketch_dict = sketch.dict(exclude={'id'})
    result = await db.sketches.insert_one(sketch_dict)
    sketch_dict['id'] = str(result.inserted_id)
    return Sketch(**sketch_dict)

@api_router.get("/sketches/project/{project_id}", response_model=List[Sketch])
async def get_project_sketches(project_id: str):
    sketches = await db.sketches.find({"project_id": project_id}).to_list(1000)
    return [Sketch(**serialize_doc(s)) for s in sketches]

@api_router.put("/sketches/{sketch_id}", response_model=Sketch)
async def update_sketch(sketch_id: str, sketch: Sketch):
    sketch_dict = sketch.dict(exclude={'id'})
    result = await db.sketches.update_one(
        {"_id": ObjectId(sketch_id)},
        {"$set": sketch_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sketch not found")
    sketch_dict['id'] = sketch_id
    return Sketch(**sketch_dict)

@api_router.delete("/sketches/{sketch_id}")
async def delete_sketch(sketch_id: str):
    result = await db.sketches.delete_one({"_id": ObjectId(sketch_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sketch not found")
    return {"message": "Sketch deleted"}

# Checklist Templates
@api_router.post("/checklist-templates", response_model=ChecklistTemplate)
async def create_checklist_template(template: ChecklistTemplate):
    template_dict = template.dict(exclude={'id'})
    result = await db.checklist_templates.insert_one(template_dict)
    template_dict['id'] = str(result.inserted_id)
    return ChecklistTemplate(**template_dict)

@api_router.get("/checklist-templates", response_model=List[ChecklistTemplate])
async def get_checklist_templates():
    templates = await db.checklist_templates.find().to_list(1000)
    return [ChecklistTemplate(**serialize_doc(t)) for t in templates]

@api_router.delete("/checklist-templates/{template_id}")
async def delete_checklist_template(template_id: str):
    result = await db.checklist_templates.delete_one({"_id": ObjectId(template_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}

# Checklists
@api_router.post("/checklists", response_model=ChecklistInstance)
async def create_checklist(checklist: ChecklistInstance):
    checklist_dict = checklist.dict(exclude={'id'})
    result = await db.checklists.insert_one(checklist_dict)
    checklist_dict['id'] = str(result.inserted_id)
    return ChecklistInstance(**checklist_dict)

@api_router.get("/checklists/project/{project_id}", response_model=List[ChecklistInstance])
async def get_project_checklists(project_id: str):
    checklists = await db.checklists.find({"project_id": project_id}).to_list(1000)
    return [ChecklistInstance(**serialize_doc(c)) for c in checklists]

@api_router.put("/checklists/{checklist_id}", response_model=ChecklistInstance)
async def update_checklist(checklist_id: str, checklist: ChecklistInstance):
    checklist_dict = checklist.dict(exclude={'id', 'created_at'})
    result = await db.checklists.update_one(
        {"_id": ObjectId(checklist_id)},
        {"$set": checklist_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Checklist not found")
    updated_checklist = await db.checklists.find_one({"_id": ObjectId(checklist_id)})
    return ChecklistInstance(**serialize_doc(updated_checklist))

@api_router.delete("/checklists/{checklist_id}")
async def delete_checklist(checklist_id: str):
    result = await db.checklists.delete_one({"_id": ObjectId(checklist_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"message": "Checklist deleted"}

# Helper function to draw annotations on a photo
def draw_annotations_on_photo(image_data_base64: str, annotations_json: str) -> BytesIO:
    """
    Takes a base64 image and JSON annotations, draws the annotations on the image,
    and returns the result as a BytesIO object.
    """
    try:
        # Decode the base64 image
        if ',' in image_data_base64:
            img_data = base64.b64decode(image_data_base64.split(',')[1])
        else:
            img_data = base64.b64decode(image_data_base64)
        
        # Open with Pillow
        pil_image = PILImage.open(BytesIO(img_data))
        img_width, img_height = pil_image.size
        
        # Convert to RGBA if needed for proper drawing
        if pil_image.mode != 'RGBA':
            pil_image = pil_image.convert('RGBA')
        
        # Parse annotations
        annotations = json.loads(annotations_json)
        paths = annotations.get('paths', [])
        
        # Get canvas dimensions from annotations if available
        annotation_canvas_width = annotations.get('canvasWidth')
        annotation_canvas_height = annotations.get('canvasHeight')
        
        if paths:
            # First, find min/max coordinates to understand the drawing area
            all_coords = []
            for path_obj in paths:
                path_str = path_obj.get('path', '')
                parts = path_str.replace('M', ' ').replace('L', ' ').split()
                for i in range(0, len(parts) - 1, 2):
                    try:
                        x = float(parts[i])
                        y = float(parts[i + 1])
                        all_coords.append((x, y))
                    except (ValueError, IndexError):
                        pass
            
            if not all_coords:
                # No valid coordinates found, return original image
                output = BytesIO()
                if pil_image.mode == 'RGBA':
                    background = PILImage.new('RGB', pil_image.size, (255, 255, 255))
                    background.paste(pil_image, mask=pil_image.split()[3])
                    pil_image = background
                pil_image.save(output, format='PNG')
                output.seek(0)
                return output
            
            min_x = min(c[0] for c in all_coords)
            max_x = max(c[0] for c in all_coords)
            min_y = min(c[1] for c in all_coords)
            max_y = max(c[1] for c in all_coords)
            
            # If we have explicit canvas dimensions, use proper scaling
            if annotation_canvas_width and annotation_canvas_height:
                # The image is displayed with "contain" mode in the canvas
                canvas_aspect = annotation_canvas_width / annotation_canvas_height
                img_aspect = img_width / img_height
                
                if img_aspect > canvas_aspect:
                    # Image is wider - fits to width
                    displayed_width = annotation_canvas_width
                    displayed_height = annotation_canvas_width / img_aspect
                    offset_x = 0
                    offset_y = (annotation_canvas_height - displayed_height) / 2
                else:
                    # Image is taller - fits to height
                    displayed_height = annotation_canvas_height
                    displayed_width = annotation_canvas_height * img_aspect
                    offset_x = (annotation_canvas_width - displayed_width) / 2
                    offset_y = 0
                
                scale_x = img_width / displayed_width
                scale_y = img_height / displayed_height
            else:
                # No canvas dimensions - estimate based on device type
                # Guess canvas size based on coordinate ranges
                if max_x > 1000:
                    # Likely iPad Pro landscape
                    estimated_canvas_width = 1550
                    estimated_canvas_height = 950
                elif max_x > 700:
                    # Likely iPad landscape or large tablet
                    estimated_canvas_width = 1450
                    estimated_canvas_height = 800
                elif max_x > 400:
                    # Likely iPhone landscape or small tablet
                    estimated_canvas_width = 1000
                    estimated_canvas_height = 380
                else:
                    # Likely iPhone portrait
                    estimated_canvas_width = 480
                    estimated_canvas_height = 800
                
                # Calculate scaling based on estimated canvas vs image
                # Simple direct scaling - canvas coordinates to image coordinates
                scale_x = img_width / estimated_canvas_width
                scale_y = img_height / estimated_canvas_height
                offset_x = 0
                offset_y = 0
            
            # Create a transparent overlay for drawing
            overlay = PILImage.new('RGBA', pil_image.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            
            for path_obj in paths:
                path_str = path_obj.get('path', '')
                color = path_obj.get('color', '#FF0000')
                stroke_width = path_obj.get('strokeWidth', 3)
                
                # Parse SVG path commands (M = moveto, L = lineto)
                # Format: "M x y L x y L x y..."
                points = []
                parts = path_str.replace('M', ' M ').replace('L', ' L ').split()
                
                i = 0
                while i < len(parts):
                    if parts[i] in ['M', 'L']:
                        if i + 2 < len(parts):
                            try:
                                x = float(parts[i + 1])
                                y = float(parts[i + 2])
                                
                                # Transform from canvas coordinates to image coordinates
                                # Subtract offset to account for image centering, then scale
                                img_x = (x - offset_x) * scale_x
                                img_y = (y - offset_y) * scale_y
                                
                                # Clamp to image bounds
                                img_x = max(0, min(img_width, img_x))
                                img_y = max(0, min(img_height, img_y))
                                
                                points.append((img_x, img_y))
                                i += 3
                            except ValueError:
                                i += 1
                        else:
                            i += 1
                    else:
                        i += 1
                
                # Convert hex color to RGB tuple
                hex_color = color.lstrip('#')
                try:
                    rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                except:
                    rgb = (255, 0, 0)  # Default to red
                
                # Scale stroke width proportionally
                scaled_stroke = max(1, int(stroke_width * max(scale_x, scale_y)))
                
                # Draw lines between consecutive points
                if len(points) >= 2:
                    for j in range(len(points) - 1):
                        draw.line(
                            [points[j], points[j + 1]],
                            fill=(*rgb, 255),
                            width=scaled_stroke
                        )
            
            # Composite the overlay onto the original image
            pil_image = PILImage.alpha_composite(pil_image, overlay)
        
        # Convert back to RGB for PDF compatibility
        if pil_image.mode == 'RGBA':
            background = PILImage.new('RGB', pil_image.size, (255, 255, 255))
            background.paste(pil_image, mask=pil_image.split()[3])
            pil_image = background
        
        # Save to BytesIO
        output = BytesIO()
        pil_image.save(output, format='PNG')
        output.seek(0)
        return output
        
    except Exception as e:
        logging.error(f"Error drawing annotations: {e}")
        # Return original image if annotation drawing fails
        if ',' in image_data_base64:
            img_data = base64.b64decode(image_data_base64.split(',')[1])
        else:
            img_data = base64.b64decode(image_data_base64)
        return BytesIO(img_data)


# Helper function to convert SVG sketch to PNG
def convert_svg_sketch_to_png(sketch_data_base64: str) -> BytesIO:
    """
    Takes a base64 SVG sketch and converts it to PNG using cairosvg.
    Returns a BytesIO object with the PNG data.
    """
    try:
        # Decode base64 SVG
        if ',' in sketch_data_base64:
            # Handle data URI format: data:image/svg+xml;base64,....
            header, data = sketch_data_base64.split(',', 1)
            svg_bytes = base64.b64decode(data)
        else:
            svg_bytes = base64.b64decode(sketch_data_base64)
        
        # Check if it's actually SVG or already PNG/JPEG
        svg_str = svg_bytes.decode('utf-8', errors='ignore')
        
        if '<svg' in svg_str.lower():
            # It's SVG, convert to PNG
            png_data = cairosvg.svg2png(bytestring=svg_bytes, output_width=800, output_height=600)
            return BytesIO(png_data)
        else:
            # It might already be a raster image, return as is
            return BytesIO(svg_bytes)
            
    except Exception as e:
        logging.error(f"Error converting SVG to PNG: {e}")
        # Try to return the original data as fallback
        try:
            if ',' in sketch_data_base64:
                img_data = base64.b64decode(sketch_data_base64.split(',')[1])
            else:
                img_data = base64.b64decode(sketch_data_base64)
            return BytesIO(img_data)
        except:
            return None


# PDF Export
@api_router.get("/export/pdf/{project_id}")
async def export_project_pdf(project_id: str):
    # Fetch project data
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    customer = await db.customers.find_one({"_id": ObjectId(project['customer_id'])})
    roofs = await db.roofs.find({"project_id": project_id}).to_list(1000)
    photos = await db.photos.find({"project_id": project_id}).to_list(1000)
    sketches = await db.sketches.find({"project_id": project_id}).to_list(1000)
    checklists = await db.checklists.find({"project_id": project_id}).to_list(1000)
    
    # Create PDF with margins
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        leftMargin=15*mm,
        rightMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm
    )
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#333333'),
    )
    
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.white,
        backColor=colors.HexColor('#1976d2'),
        alignment=TA_CENTER,
        spaceAfter=0,
        spaceBefore=0,
        leftIndent=0,
        rightIndent=0,
    )
    
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.white,
        backColor=colors.HexColor('#1976d2'),
        alignment=TA_LEFT,
        spaceBefore=10,
        spaceAfter=5,
        leftIndent=5,
    )
    
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#666666'),
    )
    
    value_style = ParagraphStyle(
        'ValueStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.black,
    )
    
    # ============ HEADER WITH LOGO ============
    logo_path = Path(__file__).parent / 'logo.png'
    
    # Create header table with logo and company info
    if logo_path.exists():
        logo_img = RLImage(str(logo_path), width=50*mm, height=35*mm)
    else:
        logo_img = Paragraph("NEBEL-BEDACHUNG", title_style)
    
    # Company info text
    company_info = """<b>Dachdeckermeister</b><br/>
    Moris Nebel<br/>
    37339 Hundeshagen<br/>
    <br/>
    <font size="8">Dächer aller Art<br/>
    Fassadenarbeiten<br/>
    Zimmerer- und Spenglerarbeiten</font>"""
    
    header_table = Table(
        [[logo_img, Paragraph(company_info, header_style)]],
        colWidths=[100*mm, 80*mm]
    )
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 5*mm))
    
    # ============ TITLE BAR ============
    title_table = Table(
        [[Paragraph("Aufmaß", title_style)]],
        colWidths=[180*mm]
    )
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1976d2')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(title_table)
    elements.append(Spacer(1, 5*mm))
    
    # ============ PROJECT INFO ============
    # Verfasser and Datum
    from datetime import datetime
    current_date = datetime.now().strftime("%d.%m.%Y")
    
    info_data = [
        [Paragraph("<b>Verfasser:</b>", label_style), Paragraph("Moris Nebel", value_style),
         Paragraph("<b>Datum:</b>", label_style), Paragraph(current_date, value_style)],
    ]
    info_table = Table(info_data, colWidths=[25*mm, 55*mm, 20*mm, 40*mm])
    info_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 3*mm))
    
    # ============ BAUHERR & OBJEKT ============
    # Helper to ensure no None values
    def safe_str(val):
        return str(val) if val is not None else ''
    
    customer_name = safe_str(customer.get('name', '')) if customer else ''
    customer_address = safe_str(customer.get('address', '')) if customer else ''
    customer_phone = safe_str(customer.get('phone', '')) if customer else ''
    customer_email = safe_str(customer.get('email', '')) if customer else ''
    
    # Parse address if available
    address_parts = customer_address.split(',') if customer_address else ['', '']
    street = address_parts[0].strip() if len(address_parts) > 0 else ''
    city_parts = address_parts[1].strip().split(' ') if len(address_parts) > 1 else ['', '']
    plz = city_parts[0] if len(city_parts) > 0 else ''
    city = ' '.join(city_parts[1:]) if len(city_parts) > 1 else ''
    
    project_name = safe_str(project.get('name', ''))
    project_desc = safe_str(project.get('description', ''))
    
    bauherr_objekt_data = [
        [Paragraph("<b>Bauherr</b>", section_title_style), Paragraph("<b>Objekt</b>", section_title_style)],
        [
            Table([
                [Paragraph("Name:", label_style), Paragraph(customer_name, value_style)],
                [Paragraph("Straße:", label_style), Paragraph(street, value_style)],
                [Paragraph("PLZ:", label_style), Paragraph(plz, value_style)],
                [Paragraph("Ort:", label_style), Paragraph(city, value_style)],
                [Paragraph("Telefon:", label_style), Paragraph(customer_phone, value_style)],
                [Paragraph("E-Mail:", label_style), Paragraph(customer_email, value_style)],
            ], colWidths=[20*mm, 65*mm]),
            Table([
                [Paragraph("Projekt:", label_style), Paragraph(project_name, value_style)],
                [Paragraph("Straße:", label_style), Paragraph(street, value_style)],
                [Paragraph("PLZ:", label_style), Paragraph(plz, value_style)],
                [Paragraph("Ort:", label_style), Paragraph(city, value_style)],
                [Paragraph("Beschreibung:", label_style), Paragraph(project_desc, value_style)],
            ], colWidths=[25*mm, 60*mm]),
        ]
    ]
    
    bauherr_objekt_table = Table(bauherr_objekt_data, colWidths=[90*mm, 90*mm])
    bauherr_objekt_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
        ('TOPPADDING', (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
    ]))
    elements.append(bauherr_objekt_table)
    elements.append(Spacer(1, 5*mm))
    
    # ============ DACHMESSUNGEN ============
    if roofs:
        roof_title = Table(
            [[Paragraph("Dachmessungen", section_title_style)]],
            colWidths=[180*mm]
        )
        roof_title.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1976d2')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(roof_title)
        
        roof_data = [[Paragraph("Dachtyp", label_style), Paragraph("Fläche (m²)", label_style), Paragraph("Notizen", label_style)]]
        for roof in roofs:
            roof_data.append([
                Paragraph(roof.get('roof_type', ''), value_style),
                Paragraph(f"{roof.get('area', 0):.2f}", value_style),
                Paragraph(roof.get('notes', '') or '', value_style),
            ])
        
        roof_table = Table(roof_data, colWidths=[50*mm, 30*mm, 100*mm])
        roof_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f5f5f5')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(roof_table)
        elements.append(Spacer(1, 5*mm))
    
    # ============ CHECKLISTEN ============
    if checklists:
        for checklist in checklists:
            checklist_title = Table(
                [[Paragraph(f"Checkliste: {checklist.get('template_name', '')}", section_title_style)]],
                colWidths=[180*mm]
            )
            checklist_title.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1976d2')),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ]))
            elements.append(checklist_title)
            
            checklist_data = []
            for item in checklist.get('items', []):
                status = "☑" if item.get('checked') else "☐"
                checklist_data.append([
                    Paragraph(f"{status} {item.get('text', '')}", value_style),
                ])
            
            if checklist_data:
                checklist_table = Table(checklist_data, colWidths=[180*mm])
                checklist_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
                elements.append(checklist_table)
            elements.append(Spacer(1, 5*mm))
    
    # ============ SONSTIGES ============
    sonstiges_title = Table(
        [[Paragraph("Sonstiges", section_title_style)]],
        colWidths=[180*mm]
    )
    sonstiges_title.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1976d2')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(sonstiges_title)
    
    # Empty box for notes
    sonstiges_box = Table(
        [[Paragraph(project.get('description', '') or "—", value_style)]],
        colWidths=[180*mm]
    )
    sonstiges_box.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 30),
    ]))
    elements.append(sonstiges_box)
    
    # ============ FOTOS (separate pages) ============
    if photos:
        elements.append(PageBreak())
        
        photos_title = Table(
            [[Paragraph("Fotos", section_title_style)]],
            colWidths=[180*mm]
        )
        photos_title.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1976d2')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(photos_title)
        elements.append(Spacer(1, 5*mm))
        
        for i, photo in enumerate(photos):
            try:
                image_data = photo.get('image_data', '')
                annotations = photo.get('annotations', '')
                
                # Check if there are annotations to draw
                if annotations and annotations.strip() and annotations != 'null':
                    img_buffer = draw_annotations_on_photo(image_data, annotations)
                else:
                    if ',' in image_data:
                        img_data = base64.b64decode(image_data.split(',')[1])
                    else:
                        img_data = base64.b64decode(image_data)
                    img_buffer = BytesIO(img_data)
                
                if img_buffer:
                    img = RLImage(img_buffer, width=160*mm, height=110*mm)
                    elements.append(img)
                    
                    desc = photo.get('description', '')
                    if desc and desc != 'None' and desc.strip():
                        elements.append(Paragraph(f"<i>{desc}</i>", value_style))
                    elements.append(Spacer(1, 10*mm))
            except Exception as e:
                logging.error(f"Error processing photo {i}: {e}")
    
    # ============ SKIZZEN (separate pages) ============
    if sketches:
        elements.append(PageBreak())
        
        sketches_title = Table(
            [[Paragraph("Skizzen", section_title_style)]],
            colWidths=[180*mm]
        )
        sketches_title.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1976d2')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(sketches_title)
        elements.append(Spacer(1, 5*mm))
        
        for i, sketch in enumerate(sketches):
            try:
                if sketch.get('title'):
                    elements.append(Paragraph(f"<b>{sketch['title']}</b>", value_style))
                
                sketch_data = sketch.get('sketch_data', '')
                if sketch_data:
                    img_buffer = convert_svg_sketch_to_png(sketch_data)
                    
                    if img_buffer:
                        img = RLImage(img_buffer, width=160*mm, height=110*mm)
                        elements.append(img)
                        elements.append(Spacer(1, 10*mm))
            except Exception as e:
                logging.error(f"Error processing sketch {i}: {e}")
    
    doc.build(elements)
    pdf_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return {
        "pdf_data": pdf_data,
        "filename": f"Aufmass_{project['name'].replace(' ', '_')}.pdf"
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
