const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;};

export function mountRouteLibrary(store,{current,isLocked,onPick,onRename,onRemove,onSaveCurrent,onViewRides,onPickByShifter}) {
  const list=document.getElementById('route-library-list'),status=document.getElementById('route-library-status');
  const search=document.getElementById('route-library-search'),favorites=document.getElementById('route-library-favorites');
  let rows=[],limit=12,editing=null,deleting=null,busy=false,revision=0;
  const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('is-error',error);};
  const button=(text,run,className='btn btn-secondary')=>{const b=element('button',text,className);b.type='button';b.addEventListener('click',run);return b;};
  async function action(work,success) {
    if(busy)return false;
    const active=document.activeElement;
    const focusAttribute=['data-favorite-route','data-select-route','data-edit-route','data-delete-route'].find(key=>active?.hasAttribute(key))||'data-edit-route';
    const focusId=active?.getAttribute(focusAttribute)||active?.closest('[data-route-id]')?.dataset.routeId;
    busy=true;sync();
    try{await work();message(success);await refresh(false);return true;}
    catch(error){message(`Could not update the route library. ${error.message}`,true);return false;}
    finally{busy=false;sync();if(focusId)(list.querySelector(`[${focusAttribute}="${focusId}"]`)||search).focus();}
  }

  function render() {
    list.replaceChildren();
    const text=search.value.trim().toLocaleLowerCase('pl');
    const filtered=rows.filter(row=>(!favorites.checked||row.favorite)&&row.name.toLocaleLowerCase('pl').includes(text));
    document.getElementById('route-library-count').textContent=`Saved routes: ${rows.length}`;
    if(!filtered.length)list.append(element('li',rows.length?'No routes match your search.':'Import a GPX file to add your first route.','route-library-empty'));
    for(const row of filtered.slice(0,limit)){
      const item=element('li',null,'library-route');item.dataset.routeId=row.id;
      const copy=element('div',null,'library-route-copy');
      const pick=button(row.name,async event=>{
        const byShifter=!event.isTrusted&&event.currentTarget.hasAttribute('data-shifter-focus');
        if(await action(()=>onPick(row),'Route selected.')&&byShifter)onPickByShifter?.();
      },'library-route-select');
      pick.dataset.selectRoute=row.id;pick.setAttribute('aria-pressed',String(current()?.libraryId===row.id));
      copy.append(pick,element('p',`${(row.distanceM/1000).toLocaleString('en-US',{maximumFractionDigits:2})} km · +${Math.round(row.ascentM)} m · climbs: ${row.climbs}`));
      const actions=element('div',null,'library-route-actions');
      const favorite=button(row.favorite?'Favorite':'Dodaj do ulubionych',()=>action(()=>store.update(row.id,{favorite:!row.favorite}),'Favorites updated.'));
      favorite.setAttribute('aria-pressed',String(row.favorite));favorite.dataset.favoriteRoute=row.id;
      const rename=button('Rename',()=>{editing=row.id;deleting=null;render();document.getElementById(`route-name-${row.id}`).focus();});
      const remove=button('Delete',()=>{deleting=row.id;editing=null;render();});
      rename.dataset.editRoute=row.id;remove.dataset.deleteRoute=row.id;
      const rides = button('Ride history', () => onViewRides(row));
      rides.dataset.journalRoute = row.id;
      rides.setAttribute('aria-label', `Rides on this route ${row.name}`);
      actions.append(rides,favorite,rename,remove);item.append(copy,actions);
      if(editing===row.id){
        const form=element('form',null,'library-route-edit'),label=element('label','Route name');
        const input=element('input');input.id=`route-name-${row.id}`;input.value=row.name;input.maxLength=80;input.required=true;input.autocomplete='off';label.htmlFor=input.id;
        const save=element('button','Save name','btn btn-primary');save.type='submit';
        form.append(label,input,save,button('Cancel',()=>{editing=null;render();}));
        form.addEventListener('submit',event=>{
          event.preventDefault();input.setCustomValidity(input.value.trim()?'':'Enter a route name.');if(!input.reportValidity())return;
          action(async()=>{const record=await store.update(row.id,{name:input.value});onRename(record);editing=null;},'Route renamed.');
        });
        input.addEventListener('input',()=>input.setCustomValidity(''));item.append(form);
      }
      if(deleting===row.id){
        const confirm=element('div',null,'library-route-confirm');
        confirm.append(element('p',`Delete route “${row.name}” from the library?`),button('Delete route',()=>action(async()=>{await store.remove(row.id);onRemove(row.id);deleting=null;},'Route deleted from your library.')),button('Cancel',()=>{deleting=null;render();}));item.append(confirm);
      }
      list.append(item);
    }
    if(filtered.length>limit){const more=element('li');more.append(button('Show more routes',()=>{limit+=12;render();}));list.append(more);}
    sync();
  }

  function sync() {
    const locked=isLocked();
    list.querySelectorAll('button').forEach(b=>{b.disabled=busy||locked&&!b.hasAttribute('data-journal-route');});
    list.querySelectorAll('[data-select-route]').forEach(b=>b.setAttribute('aria-pressed',String(current()?.libraryId===b.dataset.selectRoute)));
    list.querySelectorAll('input').forEach(e=>e.disabled=busy||locked);
    document.getElementById('btn-library-save-current').disabled=busy||locked||current()?.type!=='gpx';
    document.getElementById('route-library-lock').hidden=!locked;
  }

  async function refresh(showStatus=true) {
    const request=++revision;
    if(showStatus)message('Loading route library…');
    try{const result=await store.list();if(request!==revision)return;rows=result;render();if(showStatus)message('The route library is saved on this device.');}
    catch(error){if(request===revision){message(`The route library is unavailable. ${error.message}`,true);render();}}
  }
  search.addEventListener('input',()=>{limit=12;render();});favorites.addEventListener('change',()=>{limit=12;render();});
  document.getElementById('btn-library-refresh').addEventListener('click',()=>refresh());
  document.getElementById('btn-library-save-current').addEventListener('click',()=>action(onSaveCurrent,'Current route saved.'));
  return {refresh,sync,message};
}
