import { defineStore } from 'pinia';
import {kebabCase} from 'change-case';
import clone from 'lodash.clonedeep';



export const useImageGenStore = defineStore('imageGenerator', { 
    state : () => ({countMap:  {
        news        : [
            `/images/types/news/1.jpg`,
            `/images/types/news/2.jpg`,
            `/images/types/news/3.jpg`,
            `/images/types/news/4.jpg`,
            `/images/types/news/5.jpg`,
            `/images/types/news/6.jpg`,
            `/images/types/news/7.jpg`,
            `/images/types/news/8.jpg`
        ],
        notification: [
            `/images/types/notification/1.jpg`,
            `/images/types/notification/2.jpg`
        ],
        statement   : [
            `/images/types/statement/1.jpg`
        ],
        meeting     : [
            `/images/types/meeting/1.jpg`,
            `/images/types/meeting/2.jpg`,
            `/images/types/meeting/3.jpg`,
            `/images/types/meeting/4.jpg`,
            `/images/types/meeting/5.jpg`,
            `/images/types/meeting/6.jpg`,
            `/images/types/meeting/7.jpg`,
            `/images/types/meeting/8.jpg`
        ],
        pressRelease: [
            `/images/types/press-release/1.jpg`,
            `/images/types/press-release/2.jpg`
        ],
        events      : [
            `/images/types/events/1.jpg`,
            `/images/types/events/2.jpg`
        ],
        other       : [
            `/images/types/other/1.jpg`,
            `/images/types/other/2.jpg`,
            `/images/types/other/3.jpg`,
            `/images/types/other/4.jpg`,
            `/images/types/other/5.jpg`,
            `/images/types/other/6.jpg`,
            `/images/types/other/7.jpg`,
            `/images/types/other/8.jpg`,
            `/images/types/other/9.jpg`,
            `/images/types/other/10.jpg`,
            `/images/types/other/11.jpg`,
            `/images/types/other/12.jpg`,
            `/images/types/other/13.jpg`,
            `/images/types/other/14.jpg`,
            `/images/types/other/15.jpg`,
            `/images/types/other/16.jpg`,
            `/images/types/other/17.jpg`,
            `/images/types/other/18.jpg`,
            `/images/types/other/19.jpg`,
            `/images/types/other/20.jpg`,
            `/images/types/other/21.jpg`,
            `/images/types/other/22.jpg`
        ]
    }}),
    actions:{
        getImage (ctx) {
            if(!ctx) return
            const type   = this.getTypePath(ctx);// || this.getTypePath(ctx);
        
            if(!this.countMap[type]) consola.warn('No images for type: ', type )
            if(!this.countMap[type]) return { src: '/images/no-image.png'   , alt: '', title: ''}
        
            const src = this.getSrc(type);
        
            const alt    = ctx?.title || ctx?.name || ctx?.fieldTitle || ctx?.fieldName || '';
        
            return { alt, src, title: alt }
        },
        getSrc(type){

            if(!this.countMap[type]?.length)
                this.$reset();
            
            if(!this.countMap[type]?.length) throw new Error('No images for type: ', type)
        
            const cm  = clone(this.countMap);
            const src = cm[type].shift();
        
            this.$patch({ countMap: ref(cm)  }); //, usedMap: um
        
            return src;
        },
        getTypePath(ctx){
            const { schema:s, fieldTypePlacement} = ctx;
            
            const schema = s || this.getTypeNameFromDrupalRecord(ctx);
        
            
            // if(!schema) return undefined;
        
            const exists      = !!this.countMap[schema];
            const notEmpty    = !!this.countMap[schema]?.length || 0;
        
            if(exists && notEmpty) return schema;
            
            const otherExists   = this.countMap['other'];
            const otherNotEmpty = otherExists?.length || 0;
        
            if(otherExists && otherNotEmpty) return 'other'
        
            this.$reset();
        
            return 'other';
        },
        getTypeNameFromDrupalRecord(ctx){
            if(!ctx?.fieldTypePlacement?.drupalInternalTid) return undefined;
        
            const drupalTypes = ['', '', '', 'events']
        
            return drupalTypes[ctx?.fieldTypePlacement?.drupalInternalTid]
        
        }
    }

} );